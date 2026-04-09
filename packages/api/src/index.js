import 'dotenv/config';
import express        from 'express';
import cors           from 'cors';
import helmet         from 'helmet';
import rateLimit      from 'express-rate-limit';

import authRoutes     from './routes/auth.js';
import toursRoutes    from './routes/tours.js';
import transfersRoutes from './routes/transfers.js';
import bookingsRoutes from './routes/bookings.js';
import paymentsRoutes from './routes/payments.js';
import adminRoutes    from './routes/admin.js';
import vehiclesRoutes from './routes/vehicles.js';
import catalogRoutes  from './routes/catalog.js';
import { regionsRouter } from './routes/regions.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Segurança ──────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.TURISTA_URL || 'http://localhost:5173',
    process.env.COOP_URL    || 'http://localhost:5174',
    process.env.ADMIN_URL   || 'http://localhost:5175',
  ],
  credentials: true,
}));

// Webhook do gateway: precisa do body raw, não parseado
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      200,
  message:  { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
app.use('/api/', limiter);

// Rate limiting mais restrito para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Health check ───────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    version:   '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── Rotas ──────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/tours',     toursRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/bookings',  bookingsRoutes);
app.use('/api/payments',  paymentsRoutes);
app.use('/api/regions',   regionsRouter);
app.use('/api/admin',     adminRoutes);
app.use('/api/vehicles',  vehiclesRoutes);
app.use('/api/catalog',   catalogRoutes);

// ── Erros ──────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Giro Jeri API v2 rodando na porta ${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
