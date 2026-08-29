import 'dotenv/config';
import express        from 'express';
import cors           from 'cors';
import helmet         from 'helmet';
import rateLimit      from 'express-rate-limit';

import { supabase }   from './supabase.js';
import authRoutes     from './routes/auth.js';
import otpRoutes      from './routes/otp.js';
import broadcastRoutes from './routes/broadcast.js';
import osRoutes       from './routes/os.js';
import toursRoutes    from './routes/tours.js';
import transfersRoutes from './routes/transfers.js';
import bookingsRoutes from './routes/bookings.js';
import paymentsRoutes from './routes/payments.js';
import adminRoutes    from './routes/admin.js';
import vehiclesRoutes from './routes/vehicles.js';
import catalogRoutes  from './routes/catalog.js';
import operatorRoutes from './routes/operator.js';
import mpOauthRoutes  from './routes/mpOauth.js';
import settingsRoutes from './routes/settings.js';
import feedRoutes     from './routes/feed.js';
import storiesRoutes  from './routes/stories.js';
import establishmentsRoutes from './routes/establishments.js';
import notificationsRoutes from './routes/notifications.js';
import { regionsRouter } from './routes/regions.js';
import { seasonsRouter } from './routes/seasons.js';
import { partnerRouter } from './routes/partner.js';
import { reviewsRouter } from './routes/reviews.js';
import { affiliateRouter } from './routes/affiliate.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// Render (e qualquer reverse proxy) envia X-Forwarded-For; sem isso o
// express-rate-limit não consegue identificar o IP real do cliente.
app.set('trust proxy', 1);

// ── Segurança ──────────────────────────────────────────
app.use(helmet());

// Quem pode chamar esta API pelo navegador.
//
// `new URL(u).origin` normaliza: as variáveis podem vir com caminho
// (https://site.com/operador), e o navegador compara só o origin.
//
// `CORS_ORIGINS` (lista separada por vírgula) existe para os casos que não
// cabem nas três variáveis — um domínio antigo durante a migração, um preview.
//
// As portas locais só entram FORA de produção: com `credentials: true`, deixar
// localhost autorizado num servidor público é abrir uma porta que ninguém
// precisa.
function origensPermitidas() {
  const brutas = [
    process.env.TURISTA_URL,
    process.env.COOP_URL,
    process.env.ADMIN_URL,
    ...(process.env.CORS_ORIGINS || '').split(','),
  ];
  if (process.env.NODE_ENV !== 'production') {
    brutas.push('http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175');
  }
  const origens = new Set();
  for (const u of brutas) {
    const s = (u || '').trim();
    if (!s) continue;
    try { origens.add(new URL(s).origin); } catch { origens.add(s); }
  }
  return [...origens];
}

const ORIGENS_OK = origensPermitidas();
console.log('[cors] origens autorizadas: %s', ORIGENS_OK.join(', ') || '(NENHUMA — o app não vai conseguir chamar a API)');

app.use(cors({
  origin(origin, cb) {
    // Sem cabeçalho Origin: curl, health check do Render, webhook do Mercado
    // Pago. Não é chamada de navegador e CORS não se aplica.
    if (!origin || ORIGENS_OK.includes(origin)) return cb(null, true);
    // Sem este aviso, um bloqueio de CORS só aparece no console do NAVEGADOR e
    // o servidor não registra nada — o diagnóstico vira adivinhação. Aqui o log
    // diz a origem recusada e quais estavam valendo.
    console.warn('[cors] origem recusada: %s · autorizadas: %s', origin, ORIGENS_OK.join(', '));
    // `false`, não um Error: recusar sem cabeçalho é a resposta correta. Um
    // Error viraria 500 e mascararia o motivo real.
    cb(null, false);
  },
  credentials: true,
}));

// Webhook do gateway: precisa do body raw, não parseado
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// 8mb: o maior corpo é a OS em PDF (base64) que o operador envia no
// WhatsApp. O app já reduz o logo e refaz sem ele quando passa de ~3mb — este
// limite é só a folga para o caso de um PDF fora do padrão.
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      2000,
  message:  { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
app.use('/api/', limiter);

// Rate limiting mais restrito para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      50,
  message:  { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/register',        authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
// Troca de senha pelo link: o endpoint altera a senha da conta e não tinha
// limite nenhum — era o alvo natural para martelar tentativas de token.
app.use('/api/auth/reset-password',  authLimiter);
// Renovação de sessão: limite próprio e folgado. O refresh token do Supabase é
// aleatório e longo (não sofre força bruta), e os apps chamam este endpoint
// sozinhos ao expirar o token — com o limite estrito, vários usuários atrás do
// mesmo IP (NAT de operadora, escritório) seriam deslogados sem motivo.
app.use('/api/auth/refresh', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      300,
  message:  { error: 'Muitas renovações de sessão. Aguarde alguns minutos.' },
}));
// Ativação de afiliado gera escrita com índice único — sem limite, um bot
// logado poderia martelar tentativas de colisão de código.
app.use('/api/affiliate/activate',   authLimiter);

// Rate limiting específico para OTP (mais restrito que authLimiter)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { error: 'Muitas tentativas de verificação. Aguarde 15 minutos.' },
});
app.use('/api/auth/otp', otpLimiter);

// ── Health check ───────────────────────────────────────
// Além do status, verifica a CHAVE do Supabase de duas formas (sem expor nada
// sensível): o papel declarado na chave e um teste REAL de bypass de RLS
// (lê a contagem de `users`, tabela protegida — anon enxerga 0; service_role
// enxerga tudo). rls_bypass=true = chave certa; false = chave anon no deploy.
app.get('/health', async (_req, res) => {
  let keyRole = 'desconhecido';
  try {
    const k = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (k.startsWith('sb_secret_')) keyRole = 'sb_secret (service)';
    else if (k.startsWith('sb_publishable_')) keyRole = 'sb_publishable (ANON — errada)';
    else if (k.split('.').length === 3) {
      keyRole = JSON.parse(Buffer.from(k.split('.')[1], 'base64').toString()).role || 'jwt sem role';
    }
  } catch { /* mantém desconhecido */ }

  let rlsBypass = null;
  try {
    const { count, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true });
    if (!error) rlsBypass = (count ?? 0) > 0;
  } catch { /* deixa null = não conseguiu testar */ }

  res.json({
    status:       'ok',
    version:      '2.0.0',
    commit:       process.env.RENDER_GIT_COMMIT || null,
    timestamp:    new Date().toISOString(),
    supabase_key: keyRole,
    rls_bypass:   rlsBypass,
    // Quem pode chamar esta API pelo navegador. Fica aqui porque diagnosticar
    // CORS pelo log do servidor exige acesso ao painel, e o erro só aparece no
    // console de quem está navegando. Com isto, abrir /health no navegador
    // responde de uma vez: o deploy pegou? as variáveis chegaram?
    // Não expõe nada sensível — são domínios públicos do próprio produto.
    cors_origins: ORIGENS_OK,
  });
});

// ── Rotas ──────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/auth/otp',  otpRoutes);
app.use('/api/tours',     toursRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/bookings',  bookingsRoutes);
app.use('/api/payments',  paymentsRoutes);
app.use('/api/regions',   regionsRouter);
app.use('/api/seasons',   seasonsRouter);
app.use('/api/os',        osRoutes);            // link público da Ordem de Serviço
app.use('/api/broadcast', broadcastRoutes);     // oferta por WhatsApp: ver, aceitar, sair
app.use('/api/partner',   partnerRouter);
app.use('/api/reviews',   reviewsRouter);
app.use('/api/affiliate', affiliateRouter);
app.use('/api/admin',     adminRoutes);
app.use('/api/vehicles',  vehiclesRoutes);
app.use('/api/catalog',   catalogRoutes);
app.use('/api/operator',  operatorRoutes);
app.use('/api/mp',        mpOauthRoutes);
app.use('/api/settings',  settingsRoutes);
app.use('/api/feed',      feedRoutes);
app.use('/api/stories',   storiesRoutes);
app.use('/api/establishments', establishmentsRoutes);
app.use('/api/notifications', notificationsRoutes);

// ── Erros ──────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Turiva API v2 rodando na porta ${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
