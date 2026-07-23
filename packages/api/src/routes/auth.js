import { Router } from 'express';
import { z }      from 'zod';
import { createClient } from '@supabase/supabase-js';
import { supabase }                          from '../supabase.js';
import { authenticate }                      from '../middleware/auth.js';
import { normalizeToE164 }                   from '../lib/phone.js';
import { signSignupToken }                   from '../lib/signupToken.js';
import { signResetToken, verifyResetToken }  from '../lib/resetToken.js';
import { signMfaToken, verifyMfaToken }       from '../lib/mfaToken.js';
import { validateUsername, normalizeUsername } from '../lib/username.js';
import { notifyPasswordReset, isWhatsappEnabled } from '../services/whatsapp.js';
import { requestOtp, verifyOtp, maskDestination } from '../services/otp.js';
import { buildChannels }                     from './otp.js';

const router = Router();

// Cria client scoped ao token do usuário (necessário quando SUPABASE_SERVICE_ROLE_KEY é anon key)
function userScopedClient(token) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Client DESCARTÁVEL só para o handshake de auth (signInWithPassword/
// refreshSession). NUNCA use o client global `supabase` para isso: o
// supabase-js guarda a sessão do usuário EM MEMÓRIA no client e passa a fazer
// TODAS as queries seguintes como aquele usuário (authenticated + RLS) até o
// restart — foi a causa dos "sumiços" intermitentes (lista de usuários só com
// o admin, CNPJ 'não encontrado', INSERT barrado por RLS) que saravam sozinhos
// a cada deploy.
function freshAuthClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── Schemas ───────────────────────────────────────────────
const registerSchema = z.object({
  full_name: z.string().min(2).max(200),
  username:  z.string().min(1),                           // obrigatório (login "só usuário")
  email:     z.string().email(),                          // obrigatório (conta/recibos)
  phone:     z.string().min(7).max(30).optional(),        // opcional, normalizado → E.164
  password:  z.string().min(6),                          // front valida min 8
  lang:      z.enum(['pt', 'en', 'es']).optional().default('pt'),
});

const loginSchema = z.object({
  email:    z.string().email().optional(),
  phone:    z.string().optional(),
  cnpj:     z.string().optional(),
  username: z.string().optional(),
  password: z.string().min(1),
});

// Conjunto mínimo de colunas do perfil — usado em login e register
const PROFILE_COLS = 'id, full_name, email, phone, user_type, profile_photo_url, document_number';

// Verificação de contato (OTP) no cadastro de turista.
// DESLIGADA por padrão: a conta é criada e já entra logada, sem código.
// LIGADA (SIGNUP_REQUIRE_VERIFICATION=true): o WhatsApp vira OBRIGATÓRIO e a
// conta só ativa depois do código de 6 dígitos enviado no WhatsApp — decisão
// do usuário (12/07). Exige migration 023 aplicada + envio de WhatsApp
// configurado no ambiente.
const REQUIRE_SIGNUP_VERIFICATION = process.env.SIGNUP_REQUIRE_VERIFICATION === 'true';

// ── POST /api/auth/register ────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);

    // Valida o nome de usuário (obrigatório) com as mesmas regras do perfil.
    const { username: usernameLc, error: unameErr } = validateUsername(body.username);
    if (unameErr) return res.status(400).json({ error: unameErr });

    // Normaliza phone → E.164 se fornecido
    let phoneE164 = null;
    if (body.phone) {
      phoneE164 = normalizeToE164(body.phone, 'BR');
      if (!phoneE164) {
        return res.status(400).json({ error: 'Número de telefone inválido.' });
      }
    }
    // Ativação por código no WhatsApp: número passa a ser obrigatório.
    if (REQUIRE_SIGNUP_VERIFICATION && !phoneE164) {
      return res.status(400).json({ error: 'Informe seu WhatsApp — enviamos um código para ativar a conta.' });
    }
    // Telefone a gravar na coluna `phone`: usa o E.164 normalizado quando válido.
    const phoneToStore = phoneE164 || body.phone || null;

    // Checar duplicidade de e-mail e telefone ANTES de criar o Auth user.
    // Mensagem genérica anti-enumeração.
    const GENERIC_ERROR = 'Não foi possível concluir o cadastro. Tente fazer login.';

    // Com verificação ligada, a unicidade usa phone_e164 (migration 023). Sem ela,
    // checamos a coluna phone (já única na migration 001) — não depende do 023.
    if (phoneToStore) {
      const dupCol = REQUIRE_SIGNUP_VERIFICATION ? 'phone_e164' : 'phone';
      const dupVal = REQUIRE_SIGNUP_VERIFICATION ? phoneE164 : phoneToStore;
      const { data: dupPhone } = await supabase
        .from('users')
        .select('id')
        .eq(dupCol, dupVal)
        .maybeSingle();
      if (dupPhone) {
        return res.status(409).json({ error: GENERIC_ERROR });
      }
    }

    const { data: dupEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', body.email)
      .maybeSingle();
    if (dupEmail) {
      return res.status(409).json({ error: GENERIC_ERROR });
    }

    // Usuário já em uso? (case-insensitive). 42703 = coluna ausente (migration
    // 061 pendente) → segue sem checar, para não travar o cadastro.
    try {
      const { data: dupUser, error: uErr } = await supabase
        .from('users').select('id').eq('username', usernameLc).maybeSingle();
      if (uErr && uErr.code !== '42703') throw uErr;
      if (dupUser) return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
    } catch (e) {
      if (e?.code !== '42703') throw e;
    }

    // Cria usuário no Supabase Auth. O e-mail já nasce confirmado nos dois
    // modos — com verificação ligada, quem ativa a conta é o CÓDIGO DO
    // WHATSAPP (gate em users.phone_verified, aplicado no login).
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email:         body.email,
      password:      body.password,
      email_confirm: true,
    });

    if (authError) {
      // Erros do Auth (e-mail já cadastrado no Auth, etc.) → genérico
      console.error('[register] authError:', authError.message);
      return res.status(409).json({ error: GENERIC_ERROR });
    }

    // Insere perfil. Sem verificação, gravamos apenas colunas garantidas pela
    // migration 001 (+ language) e já marcamos email_verified=true. Com
    // verificação, incluímos phone_e164 (migration 023) e deixamos pendente.
    const insertRow = {
      auth_id:        authData.user.id,
      full_name:      body.full_name,
      username:       usernameLc,
      email:          body.email,
      phone:          phoneToStore,
      user_type:      'tourist',
      email_verified: true, // e-mail não é gate; a ativação é pelo WhatsApp
      phone_verified: false,
      language:       body.lang,
    };
    if (REQUIRE_SIGNUP_VERIFICATION) insertRow.phone_e164 = phoneE164;

    let { data: profile, error: profileError } = await supabase
      .from('users')
      .insert(insertRow)
      .select('id, full_name, username, email, phone, user_type, profile_photo_url, document_number, email_verified, phone_verified, lang:language')
      .single();

    // Migration 061 (coluna username) ainda não rodou → insere sem ela.
    if (profileError?.code === '42703') {
      const { username, ...rowNoUser } = insertRow;
      const retry = await supabase.from('users').insert(rowNoUser)
        .select('id, full_name, email, phone, user_type, profile_photo_url, document_number, email_verified, phone_verified, lang:language')
        .single();
      profile = retry.data; profileError = retry.error;
    }

    if (profileError) {
      // Rollback: apaga o Auth user criado
      await supabase.auth.admin.deleteUser(authData.user.id);
      console.error('[register] profileError:', profileError.message);
      return res.status(400).json({ error: profileError.message });
    }

    // ── Cadastro direto (sem OTP): abre a sessão e já entra logado ──────
    if (!REQUIRE_SIGNUP_VERIFICATION) {
      const { data: sess, error: sessErr } = await freshAuthClient().auth.signInWithPassword({
        email:    body.email,
        password: body.password,
      });
      if (sessErr || !sess?.session) {
        // Conta criada, mas não conseguimos abrir sessão — manda para o login.
        console.error('[register] signIn pós-cadastro falhou:', sessErr?.message);
        return res.status(201).json({ status: 'ok', next: 'login' });
      }
      return res.status(201).json({
        token:         sess.session.access_token,
        refresh_token: sess.session.refresh_token,
        user:          profile,
      });
    }

    // ── Verificação ligada: código de ativação vai pro WHATSAPP ─────────
    try {
      await requestOtp({
        userId:      profile.id,
        channel:     'whatsapp',
        destination: phoneE164,
        lang:        body.lang,
      });
    } catch (otpErr) {
      // OTP falhou mas conta foi criada — não é fatal; o wizard reenvia
      console.error('[register] OTP whatsapp falhou:', otpErr.message);
    }

    // Monta signup_token (phone_required=true: só o WhatsApp destrava)
    const signup_token = signSignupToken({ user_id: profile.id, phone_required: true });

    // Retorna sem token de sessão — front usa signup_token para o wizard
    return res.status(201).json({
      status:       'verification_required',
      signup_token,
      channels: {
        whatsapp: {
          required:    true,
          verified:    false,
          destination: maskDestination('whatsapp', phoneE164),
        },
      },
      next: 'verify_whatsapp',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── POST /api/auth/login ───────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);

    // Login por CNPJ: busca o e-mail sintético gerado pelo admin
    let authEmail = body.email;
    let authPhone = body.phone;

    // Login por nome de usuário: resolve o e-mail da conta e autentica normal.
    // Mensagem genérica (não revela se o usuário existe). Guardamos username
    // em minúsculas, então .eq() com o valor normalizado basta.
    if (body.username && !body.cnpj && !body.email) {
      const uname = normalizeUsername(body.username);
      if (uname) {
        const { data: uRow, error: uErr } = await supabase
          .from('users')
          .select('email')
          .eq('username', uname)
          .maybeSingle();
        // Coluna ausente (migration 061 pendente) → trata como "não existe".
        if (uErr && uErr.code === '42703') {
          return res.status(401).json({ error: 'Usuário ou senha incorretos' });
        }
        if (uErr) {
          return res.status(503).json({ error: 'Instabilidade momentânea no servidor. Tente novamente em alguns segundos.' });
        }
        if (!uRow?.email) {
          return res.status(401).json({ error: 'Usuário ou senha incorretos' });
        }
        authEmail = uRow.email;
        authPhone = undefined;
      }
    }

    if (body.cnpj) {
      // CNPJ vale tanto para cooperativas (operator) quanto pro admin com
      // CNPJ cadastrado — o painel da cooperativa aceita os dois.
      //
      // Comparação robusta: em vez de .eq() exato (que quebra se o
      // document_number no banco tiver formatação/espaço/caractere oculto),
      // busca os candidatos e compara só os dígitos em memória.
      const cnpjDigits = body.cnpj.replace(/\D/g, '');
      // NÃO filtra por document_type: cadastros antigos podem ter o tipo
      // vazio/'CNPJ'/outro. O que identifica é o próprio número — 14 dígitos
      // não colidem com CPF (11) — restrito a operator/admin.
      const { data: candidates, error: lookupErr } = await supabase
        .from('users')
        .select('email, document_number, document_type')
        .in('user_type', ['operator', 'admin']);

      const opUser = (candidates || []).find(
        (u) => String(u.document_number || '').replace(/\D/g, '') === cnpjDigits,
      );

      console.log('[login] cnpj=%s candidatos=%d achou=%s err=%s',
        cnpjDigits, candidates?.length || 0, opUser ? opUser.email : 'NÃO',
        lookupErr ? `${lookupErr.code}:${lookupErr.message}` : 'null');

      // Erro de consulta (deploy/instabilidade) NÃO é "CNPJ não existe" —
      // devolve 503 pedindo para tentar de novo, em vez de mensagem enganosa.
      if (lookupErr) {
        return res.status(503).json({ error: 'Instabilidade momentânea no servidor. Tente novamente em alguns segundos.' });
      }
      if (!opUser) {
        return res.status(401).json({ error: 'CNPJ não encontrado ou não autorizado' });
      }
      authEmail = opUser.email;
      authPhone = undefined;
    }

    // Autentica primeiro (valida senha antes de qualquer gate)
    const { data, error } = await freshAuthClient().auth.signInWithPassword({
      email:    authEmail,
      phone:    authPhone,
      password: body.password,
    });

    if (error) return res.status(401).json({ error: 'Credenciais incorretas' });

    // Usa client scoped ao token do usuário para que RLS passe corretamente
    const sc = userScopedClient(data.session.access_token);

    // Carrega perfil
    let { data: profile, error: pErr1 } = await sc
      .from('users')
      .select(`${PROFILE_COLS}, email_verified, phone_verified`)
      .eq('auth_id', data.user.id)
      .maybeSingle();
    if (pErr1) console.error('[login] auth_id lookup error', pErr1);

    const fallbackEmail = authEmail || data.user.email;
    if (!profile && fallbackEmail) {
      const { data: byEmail, error: pErr2 } = await sc
        .from('users')
        .select(`${PROFILE_COLS}, email_verified, phone_verified`)
        .eq('email', fallbackEmail)
        .maybeSingle();
      if (pErr2) console.error('[login] email lookup error', pErr2);
      if (byEmail) {
        profile = byEmail;
        await sc.from('users').update({ auth_id: data.user.id }).eq('id', byEmail.id);
      }
    }

    if (!profile && body.cnpj) {
      const cnpjDigits = body.cnpj.replace(/\D/g, '');
      const { data: byCnpj, error: pErr3 } = await supabase
        .from('users')
        .select(`${PROFILE_COLS}, email_verified, phone_verified`)
        .eq('document_number', cnpjDigits)
        .maybeSingle();
      if (pErr3) console.error('[login] cnpj lookup error', pErr3);
      if (byCnpj) {
        profile = byCnpj;
        await supabase.from('users').update({ auth_id: data.user.id }).eq('id', byCnpj.id);
      }
    }

    if (!profile) {
      console.error('[login] profile lookup failed', {
        auth_id:    data.user.id,
        auth_email: data.user.email,
        used_email: authEmail,
        used_cnpj:  body.cnpj,
      });
      return res.status(500).json({
        error: `Perfil não encontrado (auth_id=${data.user.id?.slice(0,8)}, email=${data.user.email})`,
      });
    }

    // ── Gate de verificação (apenas tourists) ──────────────
    if (profile.user_type === 'tourist') {
      // Ativação pelo WhatsApp: quem tem phone_e164 pendente precisa do código.
      // Contas antigas (sem phone_e164) não são travadas retroativamente.
      const phonePending = profile.phone_e164 && !profile.phone_verified;
      const emailPending = !profile.phone_e164 && !profile.email_verified;

      if (emailPending || phonePending) {
        // Senha já validada acima — pode emitir signup_token sem risco
        const phone_required = !!(profile.phone_e164);
        const signup_token   = signSignupToken({ user_id: profile.id, phone_required });
        const channels       = buildChannels(profile, phone_required);
        const next           = phonePending ? 'verify_whatsapp' : 'verify_email';

        return res.status(403).json({
          status:       'verification_required',
          signup_token,
          channels,
          next,
        });
      }
    }

    // ── 2º fator OBRIGATÓRIO (2FA por WhatsApp) — FAIL-CLOSED ───────────────
    // Como o fluxo da plataforma é quase todo por WhatsApp, o 2FA é exigido de
    // toda conta com telefone. Não é opt-in: `mfa_enabled` (default true) só
    // serve de válvula de escape de operação — uma conta em `false` (ex.: admin
    // sem WhatsApp) pula o 2º fator. FAIL-CLOSED: se a conta exige 2FA e o
    // código NÃO pôde ser entregue (canal fora do ar / envio falhou), o login é
    // BLOQUEADO — não devolvemos sessão. A única exceção é a infra do 2FA ainda
    // não estar provisionada (migration 063 pendente): aí seguimos sem 2FA para
    // não brickar o acesso entre o deploy e o `migrate`.
    if (profile.phone) {
      let mfaRequired = true;             // obrigatório por padrão
      try {
        const { data: mrow, error: mErr } = await supabase
          .from('users').select('mfa_enabled').eq('id', profile.id).maybeSingle();
        if (mErr) {
          // 42703 = coluna ausente → migration 063 pendente → 2FA ainda não
          // provisionado; não exige (evita trancar antes de aplicar a migration).
          if (mErr.code === '42703') mfaRequired = false;
          else throw mErr;
        } else if (mrow && mrow.mfa_enabled === false) {
          mfaRequired = false;            // válvula de escape de operação
        }
      } catch (e) {
        // Hiccup ao ler a flag: mantém a exigência (fail-closed).
        console.error('[login] leitura de mfa_enabled falhou:', e.message);
      }

      if (mfaRequired) {
        // Canal indisponível e a conta exige 2FA → não há como entregar o
        // código → bloqueia (fail-closed).
        if (!isWhatsappEnabled()) {
          return res.status(503).json({ error: 'Verificação em duas etapas indisponível no momento. Tente novamente em instantes.' });
        }
        const r = await startMfaChallenge(profile, data.session.refresh_token);
        if (r.status === 'ok') return res.status(200).json(r.body);
        if (r.status === 'not_provisioned') {
          // Coluna existe mas a tabela mfa_challenges não (migration 063 aplicada
          // pela metade) — segue sem 2FA para não brickar; loga em alto nível.
          console.warn('[login] MFA não provisionado (mfa_challenges ausente) — login sem 2º fator');
        } else {
          // send_failed / store_failed → FAIL-CLOSED: bloqueia o login.
          return res.status(503).json({ error: 'Não foi possível enviar o código de verificação. Tente novamente em instantes.' });
        }
      }
    }

    // Retorna sessão normal
    res.json({
      token:         data.session.access_token,
      refresh_token: data.session.refresh_token,
      user:          profile,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── 2FA: cria o desafio (envia código + guarda sessão pendente) ────────────
// Retorna um dos status:
//   { status: 'ok', body }        → corpo `mfa_required` para o cliente
//   { status: 'send_failed' }     → o código NÃO saiu (canal fora) → fail-closed
//   { status: 'store_failed' }    → não gravou o desafio (erro de banco) → fail-closed
//   { status: 'not_provisioned' } → tabela mfa_challenges ausente (migration 063
//                                    pendente) → o chamador segue sem 2FA
async function startMfaChallenge(profile, refreshToken) {
  const e164 = normalizeToE164(profile.phone, 'BR') || profile.phone;

  // 1. Envia o código — com requireDelivery (fail-closed). Cooldown (429)
  //    significa que já há um código válido em trânsito → seguimos.
  try {
    await requestOtp({
      userId:          profile.id,
      channel:         'whatsapp',
      destination:     e164,
      lang:            profile.language || 'pt',
      requireDelivery: true,
    });
  } catch (e) {
    if (e.status !== 429) {
      console.error('[login] envio do código 2FA falhou:', e.message);
      return { status: 'send_failed' };
    }
  }

  // 2. Grava a "sessão pendente".
  const { data: ch, error: chErr } = await supabase
    .from('mfa_challenges')
    .insert({
      user_id:       profile.id,
      refresh_token: refreshToken,
      expires_at:    new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();
  if (chErr) {
    // 42P01 = tabela ausente · 42703 = coluna ausente → 2FA não provisionado.
    if (chErr.code === '42P01' || chErr.code === '42703') {
      return { status: 'not_provisioned' };
    }
    console.error('[login] gravação do desafio 2FA falhou:', chErr.message);
    return { status: 'store_failed' };
  }

  const mfa_token = signMfaToken({ challenge_id: ch.id, user_id: profile.id });
  return {
    status: 'ok',
    body: {
      status:      'mfa_required',
      mfa_token,
      channel:     'whatsapp',
      destination: maskDestination('whatsapp', e164),
    },
  };
}

// ── POST /api/auth/mfa/verify ──────────────────────────────
// 2º passo do login com 2FA: confere o código do WhatsApp e, se ok, entrega a
// sessão que ficou pendente (via refresh do token guardado no desafio).
router.post('/mfa/verify', async (req, res, next) => {
  try {
    const { mfa_token, code } = req.body || {};
    if (!mfa_token) return res.status(400).json({ error: 'Sessão de verificação inválida. Faça login novamente.' });
    if (!/^\d{6}$/.test(String(code || ''))) return res.status(400).json({ error: 'Informe o código de 6 dígitos.' });

    let claims;
    try { claims = verifyMfaToken(mfa_token); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    // Desafio ainda válido (não consumido, não expirado)?
    const nowIso = new Date().toISOString();
    const { data: ch, error: chErr } = await supabase
      .from('mfa_challenges')
      .select('id, user_id, refresh_token, consumed_at, expires_at')
      .eq('id', claims.challenge_id)
      .maybeSingle();
    if (chErr) return res.status(500).json({ error: chErr.message });
    if (!ch || ch.user_id !== claims.user_id || ch.consumed_at || ch.expires_at < nowIso) {
      return res.status(410).json({ error: 'Verificação expirada. Faça login novamente.' });
    }

    // Confere o código do WhatsApp.
    const result = await verifyOtp({ userId: claims.user_id, channel: 'whatsapp', code: String(code) });
    if (!result.ok) {
      if (result.reason === 'expired') return res.status(410).json({ error: 'Código expirado. Solicite um novo.' });
      return res.status(400).json({ error: 'Código incorreto.', attempts_left: result.attempts_left });
    }

    // Marca o desafio como consumido (uso único) ANTES de emitir a sessão.
    await supabase.from('mfa_challenges')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', ch.id);

    // Reidrata a sessão pendente a partir do refresh_token guardado.
    const { data: sess, error: sErr } = await freshAuthClient().auth.refreshSession({ refresh_token: ch.refresh_token });
    if (sErr || !sess?.session) {
      return res.status(401).json({ error: 'Não foi possível concluir o login. Tente novamente.' });
    }

    const { data: profile } = await supabase
      .from('users').select(PROFILE_COLS).eq('id', claims.user_id).maybeSingle();

    return res.json({
      token:         sess.session.access_token,
      refresh_token: sess.session.refresh_token,
      user:          profile,
    });
  } catch (err) { next(err); }
});

// ── POST /api/auth/mfa/resend ──────────────────────────────
// Reenvia o código do 2º fator para o mesmo desafio em andamento.
router.post('/mfa/resend', async (req, res, next) => {
  try {
    const { mfa_token } = req.body || {};
    let claims;
    try { claims = verifyMfaToken(mfa_token); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    const nowIso = new Date().toISOString();
    const { data: ch } = await supabase
      .from('mfa_challenges')
      .select('id, user_id, consumed_at, expires_at')
      .eq('id', claims.challenge_id)
      .maybeSingle();
    if (!ch || ch.user_id !== claims.user_id || ch.consumed_at || ch.expires_at < nowIso) {
      return res.status(410).json({ error: 'Verificação expirada. Faça login novamente.' });
    }

    const { data: u } = await supabase
      .from('users').select('phone, language').eq('id', claims.user_id).maybeSingle();
    if (!u?.phone) return res.status(400).json({ error: 'Telefone não cadastrado.' });
    const e164 = normalizeToE164(u.phone, 'BR') || u.phone;

    try {
      await requestOtp({ userId: claims.user_id, channel: 'whatsapp', destination: e164, lang: u.language || 'pt', requireDelivery: true });
    } catch (e) {
      if (e.status === 429) return res.status(429).json({ error: e.message, retry_after: e.retry_after });
      if (e.status === 502) return res.status(503).json({ error: 'Não foi possível reenviar o código agora. Tente novamente em instantes.' });
      throw e;
    }
    return res.json({ ok: true, destination: maskDestination('whatsapp', e164) });
  } catch (err) { next(err); }
});

// ── GET /api/auth/me ───────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const ME_BASE = `id, full_name, email, phone, user_type, profile_photo_url,
               birth_date, document_type, document_number, preferred_region_id,
               nationality, gender, language, affiliate_code,
               emergency_contact_name, emergency_contact_phone,
               pix_key_type, pix_key, bank_name, bank_agency,
               bank_account_number, bank_account_type, bank_document`;
    // Colunas de migrations recentes (057/058/061) — tolera banco desatualizado.
    let { data: profile, error } = await supabase
      .from('users')
      .select(`${ME_BASE}, emergency_contact_email, whatsapp_valid, username, mfa_enabled`)
      .eq('id', req.user.id)
      .single();
    if (error?.code === '42703') {
      // Alguma coluna recente ausente (057/061/063). Tenta um degrau abaixo
      // (sem mfa_enabled) e, se ainda faltar, cai no conjunto base garantido.
      let retry = await supabase.from('users')
        .select(`${ME_BASE}, emergency_contact_email, whatsapp_valid, username`)
        .eq('id', req.user.id).single();
      if (retry.error?.code === '42703') {
        retry = await supabase.from('users').select(ME_BASE).eq('id', req.user.id).single();
      }
      profile = retry.data; error = retry.error;
    }
    if (error) return res.status(500).json({ error: error.message });

    const { data: cover } = await supabase
      .from('users').select('cover_photo_url').eq('id', req.user.id).maybeSingle();
    if (cover && 'cover_photo_url' in cover) profile.cover_photo_url = cover.cover_photo_url;

    res.json({ user: profile });
  } catch (err) { next(err); }
});

// ── POST /api/auth/forgot-password ────────────────────────
// Item 3: identifica o usuário por e-mail OU telefone e envia o link de reset
// por WhatsApp (com fallback para e-mail se não houver telefone). Resposta
// SEMPRE genérica (não revela se a conta existe).
const forgotSchema = z.object({
  email:        z.string().optional(),
  phone:        z.string().optional(),
  identifier:   z.string().optional(),   // e-mail ou telefone num campo só
  redirect_url: z.string().url().optional(),
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email, phone, identifier, redirect_url } = forgotSchema.parse(req.body);
    const raw = (identifier || email || phone || '').trim();
    if (!raw) return res.status(400).json({ error: 'Informe seu e-mail ou telefone.' });

    const isEmail = raw.includes('@');
    let user = null;
    if (isEmail) {
      const { data } = await supabase.from('users')
        .select('id, email, phone').ilike('email', raw).maybeSingle();
      user = data;
    } else {
      const e164 = normalizeToE164(raw) || raw;
      const digits = raw.replace(/\D/g, '');
      const { data } = await supabase.from('users')
        .select('id, email, phone')
        .or(`phone.eq.${e164},phone.eq.${digits}`)
        .limit(1).maybeSingle();
      user = data;
    }

    // Envia se achou; senão, responde ok mesmo assim (anti-enumeração).
    if (user) {
      const token = signResetToken(user.id);
      if (user.phone) {
        notifyPasswordReset(user.phone, token).catch((err) =>
          console.error('[reset] whatsapp falhou:', err.message));
      } else if (user.email) {
        // Sem telefone → mantém o reset por e-mail do Supabase.
        supabase.auth.resetPasswordForEmail(user.email, { redirectTo: redirect_url })
          .catch((err) => console.error('[reset] email falhou:', err?.message));
      }
    }
    res.json({ ok: true, channel: user?.phone ? 'whatsapp' : 'email' });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos' });
    next(err);
  }
});

// ── POST /api/auth/reset-password ─────────────────────────
// Valida o token do link (WhatsApp) e troca a senha via admin.
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, new_password } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Link inválido.' });
    if (!new_password || String(new_password).length < 8) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
    }
    let claims;
    try { claims = verifyResetToken(token); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    const { data: profile } = await supabase.from('users')
      .select('id, auth_id, email').eq('id', claims.user_id).maybeSingle();
    if (!profile?.auth_id) return res.status(404).json({ error: 'Conta não encontrada.' });

    const { error } = await supabase.auth.admin.updateUserById(profile.auth_id, { password: new_password });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /api/auth/refresh ─────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token obrigatório' });
    }

    const { data, error } = await freshAuthClient().auth.refreshSession({ refresh_token });
    if (error || !data.session) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }

    const { data: profile } = await supabase
      .from('users')
      .select(PROFILE_COLS)
      .eq('auth_id', data.user.id)
      .maybeSingle();

    res.json({
      token:         data.session.access_token,
      refresh_token: data.session.refresh_token,
      user:          profile,
    });
  } catch (err) { next(err); }
});

// ── PATCH /api/auth/me ─────────────────────────────────────
const updateProfileSchema = z.object({
  full_name:               z.string().min(2).max(200).optional(),
  username:                z.string().max(30).optional().nullable(),
  mfa_enabled:             z.boolean().optional(),
  phone:                   z.string().min(10).max(30).optional(),
  birth_date:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  document_type:           z.enum(['cpf', 'cnpj', 'passport', 'rg', 'cnh', 'other']).optional().nullable(),
  document_number:         z.string().max(30).optional().nullable(),
  nationality:             z.string().max(100).optional().nullable(),
  gender:                  z.enum(['male', 'female', 'non_binary', 'prefer_not_to_say']).optional().nullable(),
  emergency_contact_name:  z.string().max(200).optional().nullable(),
  emergency_contact_phone: z.string().max(30).optional().nullable(),
  emergency_contact_email: z.string().email().max(200).optional().nullable().or(z.literal('')),
  language:                z.string().max(10).optional(),
  profile_photo_url:       z.string().max(3_000_000).optional().nullable(),
  pix_key_type:            z.enum(['cpf', 'cnpj', 'email', 'phone', 'random_key']).optional().nullable(),
  pix_key:                 z.string().max(200).optional().nullable(),
  bank_name:               z.string().max(100).optional().nullable(),
  bank_agency:             z.string().max(20).optional().nullable(),
  bank_account_number:     z.string().max(30).optional().nullable(),
  bank_account_type:       z.enum(['corrente', 'poupanca']).optional().nullable(),
  bank_document:           z.string().max(30).optional().nullable(),
});

router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const body = updateProfileSchema.parse(req.body);

    // Nome de usuário: valida formato e unicidade (case-insensitive). String
    // vazia → limpa (null). Guardado em minúsculas para o login por username.
    if (body.username !== undefined) {
      if (body.username === null || body.username.trim() === '') {
        body.username = null;
      } else {
        const { username, error: uErr } = validateUsername(body.username);
        if (uErr) return res.status(400).json({ error: uErr });
        const { data: taken, error: tErr } = await supabase
          .from('users')
          .select('id')
          .eq('username', username)
          .neq('id', req.user.id)
          .maybeSingle();
        if (tErr?.code === '42703') {
          return res.status(400).json({ error: 'Recurso indisponível: aplique a migration 061 (coluna username) no banco.' });
        }
        if (tErr) return res.status(500).json({ error: tErr.message });
        if (taken) return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
        body.username = username;
      }
    }

    // 2FA por WhatsApp: só pode ligar quem tem telefone (o código vai pra lá).
    // Usa o telefone que está vindo no update ou o já cadastrado.
    if (body.mfa_enabled === true) {
      let phone = body.phone;
      if (!phone) {
        const { data: u } = await supabase
          .from('users').select('phone').eq('id', req.user.id).maybeSingle();
        phone = u?.phone;
      }
      if (!phone) {
        return res.status(400).json({ error: 'Cadastre um telefone (WhatsApp) antes de ativar a verificação em duas etapas.' });
      }
    }

    // CPF/CNPJ: guarda só os dígitos pra o login (que busca por dígitos) bater.
    // Sem isso, salvar "86.981.608/0001-60" quebra o login por CNPJ.
    if (body.document_number) {
      if (body.document_type === 'cpf' || body.document_type === 'cnpj') {
        body.document_number = body.document_number.replace(/\D/g, '');
      } else if (body.document_type === 'passport') {
        body.document_number = body.document_number.trim().toUpperCase();
      }
      // CPF/CNPJ: dígitos verificadores (mod 11). Passaporte: formato.
      const { validateBrDoc } = await import('../lib/document.js');
      const docErr = validateBrDoc(body.document_type, body.document_number);
      if (docErr) return res.status(400).json({ error: docErr });
    }
    if (body.emergency_contact_email === '') body.emergency_contact_email = null;
    if (body.bank_document) {
      body.bank_document = body.bank_document.replace(/\D/g, '');
    }

    const { data: updated, error } = await supabase
      .from('users')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.user.id)
      .select(`id, full_name, email, phone, user_type, profile_photo_url,
               document_number, birth_date, language, preferred_region_id,
               pix_key_type, pix_key, bank_name, bank_agency,
               bank_account_number, bank_account_type, bank_document`)
      .single();

    if (error) {
      // Corrida de unicidade do username (índice único) — mensagem amigável.
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
      }
      // Coluna username ausente (migration 061 pendente) ao definir/limpar.
      if (error.code === '42703' && 'username' in body) {
        return res.status(400).json({ error: 'Recurso indisponível: aplique a migration 061 (coluna username) no banco.' });
      }
      // Coluna mfa_enabled ausente (migration 063 pendente).
      if (error.code === '42703' && 'mfa_enabled' in body) {
        return res.status(400).json({ error: 'Recurso indisponível: aplique a migration 063 (verificação em duas etapas) no banco.' });
      }
      return res.status(400).json({ error: error.message });
    }

    // Telefone mudou → rechecagem automática do WhatsApp (fire-and-forget).
    // A plataforma depende de mensagens automáticas; o status fica no perfil.
    if (body.phone !== undefined) {
      recheckWhatsapp(req.user.id, body.phone).catch((err) =>
        console.error('[whatsapp] rechecagem pós-update falhou:', err.message));
    }

    res.json({ user: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// Checa no Z-API se o telefone tem WhatsApp e persiste o resultado no perfil.
// Erros de coluna (migration 057 pendente) são engolidos — nunca quebra fluxo.
async function recheckWhatsapp(userId, phone) {
  const { checkPhoneExists } = await import('../services/whatsapp.js');
  const r = await checkPhoneExists(phone);
  if (!r.checked) return r;
  const { error } = await supabase
    .from('users')
    .update({ whatsapp_valid: r.exists, whatsapp_checked_at: new Date().toISOString() })
    .eq('id', userId);
  if (error && error.code !== '42703') throw error;
  return r;
}

// ── POST /api/auth/check-whatsapp ────────────────────────
// Checagem avulsa (não persiste): usada p/ validar QUALQUER número no app —
// ex.: telefone do contato de emergência — sem enviar mensagem.
router.post('/check-whatsapp', authenticate, async (req, res, next) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    if (phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ error: 'Informe um telefone válido com DDD.' });
    }
    const { checkPhoneExists } = await import('../services/whatsapp.js');
    const r = await checkPhoneExists(phone);
    if (!r.checked) {
      return res.status(503).json({ error: 'Verificação indisponível no momento. Tente mais tarde.' });
    }
    res.json({ phone, exists: r.exists });
  } catch (err) { next(err); }
});

// ── POST /api/auth/me/verify-whatsapp ────────────────────
// Botão "Verificar WhatsApp" do perfil: checa o número cadastrado (sem enviar
// mensagem) e devolve o status. 200 sempre que a checagem rodou.
router.post('/me/verify-whatsapp', authenticate, async (req, res, next) => {
  try {
    const { data: u } = await supabase
      .from('users').select('phone').eq('id', req.user.id).maybeSingle();
    if (!u?.phone) {
      return res.status(400).json({ error: 'Cadastre um telefone no perfil antes de verificar.' });
    }
    const r = await recheckWhatsapp(req.user.id, u.phone);
    if (!r.checked) {
      return res.status(503).json({ error: 'Verificação indisponível no momento (canal WhatsApp não configurado). Tente mais tarde.' });
    }
    res.json({ phone: u.phone, whatsapp_valid: r.exists });
  } catch (err) { next(err); }
});

// ── GET /api/auth/me/whatsapp-status ─────────────────────
// Status persistido (para o perfil exibir sem rechecar toda hora).
router.get('/me/whatsapp-status', authenticate, async (req, res, next) => {
  try {
    let { data: u, error } = await supabase
      .from('users')
      .select('phone, whatsapp_valid, whatsapp_checked_at')
      .eq('id', req.user.id)
      .maybeSingle();
    if (error?.code === '42703') {
      // Migration 057 pendente — devolve só o telefone, sem status.
      const retry = await supabase.from('users').select('phone').eq('id', req.user.id).maybeSingle();
      u = { ...retry.data, whatsapp_valid: null, whatsapp_checked_at: null };
    } else if (error) throw error;
    res.json(u || {});
  } catch (err) { next(err); }
});

// ── POST /api/auth/me/photo ───────────────────────────────
router.post('/me/photo', authenticate, async (req, res, next) => {
  try {
    const { photo_data } = req.body;
    if (!photo_data || typeof photo_data !== 'string') {
      return res.status(400).json({ error: 'Dados de imagem ausentes' });
    }

    const match = photo_data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Formato inválido. Use JPEG, PNG ou WebP.' });
    }

    const [, mimeType, b64] = match;
    const buffer = Buffer.from(b64, 'base64');

    if (buffer.byteLength > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Imagem muito grande. Máximo 2 MB.' });
    }

    const ext  = mimeType.split('/')[1];
    const path = `${req.user.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    await supabase
      .from('users')
      .update({ profile_photo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);

    res.json({ url: publicUrl });
  } catch (err) { next(err); }
});

// ── POST /api/auth/me/cover ───────────────────────────────
router.post('/me/cover', authenticate, async (req, res, next) => {
  try {
    const { photo_data } = req.body;
    if (!photo_data || typeof photo_data !== 'string') {
      return res.status(400).json({ error: 'Dados de imagem ausentes' });
    }

    const match = photo_data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Formato inválido. Use JPEG, PNG ou WebP.' });
    }

    const [, mimeType, b64] = match;
    const buffer = Buffer.from(b64, 'base64');

    if (buffer.byteLength > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Imagem muito grande. Máximo 2 MB.' });
    }

    const ext  = mimeType.split('/')[1];
    const path = `cover-${req.user.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const versionedUrl = `${publicUrl}?v=${Date.now()}`;

    const { error: updError } = await supabase
      .from('users')
      .update({ cover_photo_url: versionedUrl, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);

    if (updError) {
      return res.status(500).json({
        error: 'Não foi possível salvar a capa. Verifique se a migration 015 (coluna cover_photo_url) foi aplicada no banco.',
      });
    }

    res.json({ url: versionedUrl });
  } catch (err) { next(err); }
});

// ── POST /api/auth/logout ──────────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    await supabase.auth.admin.signOut(token);
    res.json({ message: 'Sessão encerrada' });
  } catch (err) { next(err); }
});

export default router;
