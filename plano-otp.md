DESIGN ACORDADO — Verificação obrigatória de cadastro (e-mail + WhatsApp via OTP)
Decisões sobre as 7 divergências
1. Emissão da sessão final no verify → FALLBACK do Arquiteto: front reusa a senha. Sem token no verify.
Razão: confirmei o supabase-js 2.103.0. Não há, no client, método suportado para "emitir sessão a partir de user_id" — auth.admin cria usuário/gera link, mas a sessão (access_token+refresh_token) só nasce de signInWithPassword ou refreshSession. A rota atual já faz exatamente isso (linha 56). Inventar emissão de JWT Supabase à mão (assinar com o JWT secret do projeto) é frágil e quebra refresh. Portanto:

otp/verify do último canal pendente responde {status:'verified'} sem token.
O front, no VerifyStep final, chama api.login({email, password}) reusando a senha que já está no state do Register (a senha nunca saiu do cliente nesse fluxo de wizard single-route, então é seguro e simples).
Importante: para signInWithPassword funcionar, a conta Auth precisa estar com e-mail confirmado. Como removemos email_confirm:true, o register deve criar com email_confirm:false e o backend deve marcar o e-mail como confirmado no Auth (auth.admin.updateUserById(authId, { email_confirm: true })) no momento do otp/verify do canal e-mail. Sem isso o login falha.
2. Fonte de verdade do estado de verificação → Booleanos legados email_verified/phone_verified são a fonte de verdade. Timestamps *_verified_at entram como complemento auditável, derivado, não autoritativo.
Razão: os booleanos já existem em users (001, linhas 170-171) com NOT NULL DEFAULT FALSE. Criar timestamps como nova fonte e ignorar os booleanos cria estado duplicado e divergente. Regra única: verified == TRUE ⇔ *_verified_at IS NOT NULL. A API só escreve os dois juntos, na mesma transação/update. Lógica de negócio (gate de cadastro) lê o boolean; o timestamp é só para auditoria/grandfather.

3. Nomenclatura do identificador → signup_token (JWT HS256) é o nome canônico. UX deve renomear verification_id → signup_token.
Razão: não é um id opaco de linha; é uma credencial assinada que carrega user_id, phone_required, purpose:'signup' e TTL. O front recebe no retorno do register, guarda no state local do wizard e reenvia no body de todo otp/request e otp/verify. Um único nome em API, contrato e UI.

4. Backfill de contas legadas → SIM, grandfather. Marcar turistas existentes como verificados.
Razão: verificação passa a ser obrigatória só no novo cadastro; bloquear quem já usa a plataforma é regressão de produto inaceitável. Na migration 023:

email_verified = TRUE e email_verified_at = COALESCE(last_login_at, created_at) para todo user_type='tourist' com email IS NOT NULL.
phone_verified = TRUE e phone_verified_at = COALESCE(last_login_at, created_at) somente onde phone IS NOT NULL (não inventamos verificação de quem não tem telefone).
Operadores/admins: fora de escopo deste fluxo, mas para não quebrar gates futuros, aplicar o mesmo grandfather a todos os user_type que já têm o contato preenchido.
5. Semântica "verificar depois" do WhatsApp → NÃO existe "pular" que mantém número pendente. A única saída sem verificar é "editar/remover o número".
Razão: decisão de produto travada: WhatsApp é obrigatório se informado. Permitir concluir com número não-verificado contradiz isso e deixa phone órfão e não-confiável. UX:

Passo WhatsApp não tem botão "Verificar depois".
Tem ação "Não tenho WhatsApp / usar outro número" que volta ao passo do telefone (VERIFY_EMAIL→FORM do campo phone) e limpa o número.
Se o usuário remove o número, o backend remove phone do pending e conclui só com e-mail (estrangeiro). Se mantém, tem de verificar. Sem terceiro caminho.
6. Hash do código → HMAC-SHA256 com pepper (OTP_PEPPER). Coluna continua CHAR(64) (hex de 32 bytes).
Razão: o espaço é só 10^6 (6 dígitos). SHA-256 puro de um número de 6 dígitos é trivialmente reversível por brute-force offline se a tabela vazar (1M de hashes pré-computáveis em segundos). HMAC com pepper fora do banco torna o vazamento da tabela insuficiente para recuperar códigos. Custo zero (Node crypto.createHmac), sem dependência nova. Comprimento do digest é idêntico, então o schema do DBA (CHAR(64)) não muda. Env nova: OTP_PEPPER (obrigatória em prod; em dev, fallback fixo documentado).

7. Unicidade de telefone → Consolidar em phone_e164 como a coluna canônica com UNIQUE parcial. Derrubar o UNIQUE de phone legado (vira coluna de exibição, sem unicidade).
Razão: dois caminhos de unicidade (phone UNIQUE + phone_e164 UNIQUE) conflitam — o mesmo número em formatos diferentes passa num índice e falha no outro, e cadastros concorrentes batem em índices distintos. Uma só verdade:

phone_e164 VARCHAR(20) com UNIQUE parcial WHERE phone_e164 IS NOT NULL.
Remover a constraint UNIQUE de phone (drop do índice único; manter a coluna como label livre + idx_users_phone não-único se quiser lookup).
Toda checagem de duplicidade e o vínculo com Auth usam phone_e164. O número só é gravado/promovido após verificação.
Atenção (handoff ao DBA/Eng): a constraint users_contact_check (001 linha 175) exige email OR phone. Estrangeiro sem telefone continua válido por ter e-mail — ok, não muda.
Sobre normalização E.164: aprovo google-libphonenumber no backend (dependência nova justificada: parsing E.164 correto é requisito de segurança/unicidade e não dá para fazer à mão de forma confiável). O front faz seletor de DDI + máscara; o backend é a autoridade que normaliza e persiste phone_e164.

Ordem de implementação
Etapa 1 — BANCO (DBA, supabase/migrations/023_*.sql)
email_verified_at TIMESTAMPTZ, phone_verified_at TIMESTAMPTZ em users (nullable; complementam os booleanos).
phone_e164 VARCHAR(20) em users; criar UNIQUE INDEX ... WHERE phone_e164 IS NOT NULL; dropar a constraint UNIQUE de phone.
Enum otp_channel ('email','whatsapp') + tabela otp_codes conforme spec do DBA: code_hash CHAR(64) (agora HMAC-SHA256 hex), expires_at DEFAULT now()+10min, attempts, max_attempts DEFAULT 5, resend_count, last_resend_at, consumed_at, invalidated_at, FK user_id ON DELETE CASCADE. Índice único parcial (user_id, channel) WHERE consumed_at IS NULL AND invalidated_at IS NULL. Índices de lookup + expires_at.
RLS habilitado, zero policies (só service_role acessa).
Função purge_expired_otp_codes().
Backfill grandfather (decisão 4) no fim da migration.
SQL de verificação no rodapé (TEAM.md §2) + script em supabase/scripts/.
Etapa 2 — API (Engenheiro Senior, packages/api/src)
services/whatsapp.js — padrão no-op do email.js. Envs ZAPI_*. E.164 sem '+' na chamada Z-API.
services/otp.js — gerar código (crypto), hmacCode(code) com OTP_PEPPER, request (cooldown 60s, teto 5/canal/hora), verify (max 5 tentativas, expira 10min, single active via índice parcial), normalização E.164 via google-libphonenumber.
Refatorar POST /register: createUser({ email_confirm:false }), não auto-loga, insere perfil pending com phone_e164 (se houver), emite signup_token (JWT HS256, SIGNUP_TOKEN_SECRET, TTL 30min, purpose:'signup', user_id, phone_required). Retorna { signup_token, status:'verification_required', next:'verify_email' }.
POST /api/auth/otp/request {signup_token, channel} — valida token, gera+envia OTP. Zod + os limites.
POST /api/auth/otp/verify {signup_token, channel, code}:
valida, marca *_verified+*_verified_at.
no canal email: auth.admin.updateUserById(authId,{email_confirm:true}) (decisão 1).
no canal whatsapp: promove phone/phone_e164 ao Auth (updateUserById phone).
se ainda falta canal: {status:'verification_required', next:'verify_whatsapp'}. Se completo: {status:'verified'} sem token.
Gate de login: conta tourist com email_verified=false (ou phone_verified=false com phone) → login retorna 403 {status:'verification_required'} para o front retomar o wizard (cobre a objeção de refresh do UX).
Etapa 3 — UI (Frontend Expert, packages/turista/src)
Register.jsx: state machine local FORM | VERIFY_EMAIL | VERIFY_WHATSAPP | DONE, mesma rota /register. Guarda signup_token e password no state.
Componentes novos: OtpInput, OtpStep, Stepper, PhoneField (seletor DDI). Reusa Button/Input/Select/Spinner, lucide, useMutation.
Stepper "Passo X de Y" com Y dinâmico (2 se sem telefone, 3 se com).
Passo final: ao {status:'verified'}, chamar api.login({email,password}) (decisão 1) e seguir autenticado.
Passo WhatsApp: ação "editar/remover número" (decisão 5), sem "pular".
i18n: namespace verify + chaves em auth, nos 3 locales (pt/en/es), incluindo corpo do e-mail OTP e texto do WhatsApp (copy já entregue pelo UX).
Login de conta pendente: tratar 403 verification_required redirecionando ao wizard.
Conflitos ainda abertos
Nenhum exige rodada 2 com papel específico — todas as 7 divergências foram resolvidas com fato confirmado. Dois pontos de atenção durante a implementação (não bloqueiam o design):

Enumeração de e-mail (levantado por UX): no register, quando o e-mail já existe, retornar mensagem genérica ("não foi possível concluir, tente login"), não "e-mail já cadastrado". Decisão: genérica. — confirmar microcopy com UX na entrega, não antes.
Promoção de phone ao Auth (Arquiteto): telefone é único no Auth. Se dois cadastros pending verificarem o mesmo número, o segundo updateUserById(phone) falha. Tratar como erro de verify ("número já em uso") — Eng Senior implementa o catch; já coberto pela unicidade de phone_e164 na decisão 7.
Critérios de aceite consolidados
register não auto-loga; cria Auth com email_confirm:false e retorna signup_token + status:'verification_required'.
E-mail é sempre verificado por OTP 6 dígitos via Resend; conclusão impossível sem isso.
WhatsApp é verificado por OTP via Z-API somente se número informado; estrangeiro sem número conclui só com e-mail.
otp/request: cooldown 60s, teto 5/canal/hora; otp/verify: expira 10min, máx 5 tentativas, 1 OTP ativo por (user,channel).
Código persistido como HMAC-SHA256 + OTP_PEPPER, nunca em claro.
Estado de verificação tem fonte única: booleanos *_verified ⇔ *_verified_at.
Unicidade de telefone exclusivamente por phone_e164 (E.164 normalizado no backend); UNIQUE de phone removido.
Contas legadas com contato preenchido entram como verificadas (grandfather), sem bloqueio.
Verify do último canal retorna {status:'verified'} e o front loga via api.login reusando a senha.
Login de conta pendente retorna verification_required e a UI retoma o wizard.
Wizard single-route com Stepper Y dinâmico, OtpInput (autocomplete one-time-code, auto-submit), destinos mascarados, countdown 60s.
i18n completo nos 3 locales (verify + auth), incluindo corpo do e-mail e texto do WhatsApp.
Services email.js e whatsapp.js no-op sem key (dev sobe sem credenciais).
Migration 023 com RLS, índices, função de purge, backfill e SQL de verificação no rodapé.
Decisões
7 divergências resolvidas: (1) fallback front-reusa-senha — confirmei supabase-js 2.103.0, sem emissão de sessão por user_id; (2) booleanos legados são a fonte de verdade, timestamps são complemento; (3) signup_token é o nome canônico; (4) grandfather sim; (5) sem "pular", só editar/remover número; (6) HMAC-SHA256 + pepper; (7) consolidar em phone_e164, dropar UNIQUE de phone. Adicionei o passo crítico de email_confirm:true no verify de e-mail, sem o qual o signInWithPassword do fallback falha.
Riscos / Objeções
O fallback depende da senha viver no state do wizard — aceitável por ser single-route e a senha nunca sair do cliente; se UX um dia quebrar o cadastro em múltiplas rotas, este caminho precisa rever.
google-libphonenumber é dependência nova — justificada por unicidade/segurança de E.164; Eng Senior deve adicionar só na API.
Dropar UNIQUE de phone numa tabela com dados exige cuidado no backfill de phone_e164 antes de confiar na nova unicidade (números legados fora do padrão E.164 não migram e ficam sem unicidade até re-verificação) — aceito como dívida conhecida.
Handoff
Para DBA: implementar 023_*.sql conforme Etapa 1 (timestamps, phone_e164 + UNIQUE parcial, drop UNIQUE de phone, enum+otp_codes com code_hash HMAC, RLS sem policy, purge_expired_otp_codes(), backfill grandfather, SQL de verificação). Confirmado por mim: users já tem os booleanos (001:170-171) e phone UNIQUE (001:162).
Para Engenheiro Senior: Etapa 2. Pontos não-negociáveis: email_confirm:false no register + email_confirm:true no verify de e-mail; HMAC com OTP_PEPPER; normalização E.164 com google-libphonenumber; signup_token JWT HS256 com SIGNUP_TOKEN_SECRET; gate de login 403 pending; verify final retorna {status:'verified'} sem token.
Para Frontend Expert: Etapa 3. Renomear verification_id→signup_token; login final via api.login({email,password}) do state; passo WhatsApp sem "pular"; Stepper Y dinâmico; i18n 3 locales.
Para UX: confirmar na entrega a microcopy de erro genérica para e-mail já cadastrado (anti-enumeração) e o texto da ação "editar/remover número" no passo WhatsApp.
Para PO: escopo travado nos 14 critérios acima. Nada cortado; nenhuma pendência de produto aberta. Design aprovado para implementar na ordem banco→API→UI.
agentId: a1cb13f8dc8d5920b (use SendMessage with to: 'a1cb13f8dc8d5920b' to continue this agent)
<usage>subagent_tokens: 26083
tool_uses: 9
duration_ms: 121773</usage>