import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { semVinculoNoBanco } from '../lib/vinculoEmpresa.js';
import companyTeam from './companyTeam.js';
import companyBookings from './companyBookings.js';
import companyPayouts from './companyPayouts.js';
import companySellerPayouts from './companySellerPayouts.js';

const router = Router();
// Empresa logada — ou o ADMIN operando uma empresa (como já faz com os painéis
// de passeios e estacionamento). O admin diz QUAL empresa no cabeçalho
// X-Company-Id; daí em diante as rotas enxergam `req.user.id` = a empresa, e o
// admin de verdade fica em `req.actorId` (é ele quem vai para a auditoria).
router.use(authenticate, requireRole('company', 'admin'));

// Lista para o admin escolher a empresa. Vem ANTES de `empresaAlvo`.
router.get('/companies', async (req, res, next) => {
  try {
    if (req.user.user_type !== 'admin') return res.status(403).json({ error: 'Acesso restrito.' });
    const { data, error } = await supabase.from('users').select('id, full_name, is_active')
      .eq('user_type', 'company').order('full_name', { ascending: true }).limit(500);
    if (error) throw error;
    res.set('Cache-Control', 'no-store');
    res.json({ companies: data || [] });
  } catch (err) { next(err); }
});

async function empresaAlvo(req, res, next) {
  try {
    if (req.user.user_type !== 'admin') return next();
    const id = String(req.get('X-Company-Id') || '');
    if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'Escolha a empresa.' });
    const { data: empresa, error } = await supabase.from('users').select('id, full_name')
      .eq('id', id).eq('user_type', 'company').maybeSingle();
    if (error) throw error;
    if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada.' });
    req.actorId = req.user.id;
    req.user = { ...req.user, id: empresa.id, user_type: 'company', full_name: empresa.full_name };
    next();
  } catch (err) { next(err); }
}
router.use(empresaAlvo);
router.use(companyTeam);   // /team — equipe de operadores da empresa
router.use(companyBookings);   // /bookings — reservas e desempenho da equipe
router.use(companyPayouts);   // /executor-payouts — repasses a quem executou
router.use(companySellerPayouts);   // /seller-payouts — comissão do operador que vendeu
const FIELDS = 'bank_name, bank_agency, bank_account_number, bank_account_type, bank_document, pix_key_type, pix_key';
const accountSchema = z.object({
  bank_name: z.string().trim().max(100).nullable(),
  bank_agency: z.string().trim().max(20).nullable(),
  bank_account_number: z.string().trim().max(30).nullable(),
  bank_account_type: z.enum(['corrente', 'poupanca']).nullable(),
  bank_document: z.string().trim().max(30).nullable(),
  pix_key_type: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random_key']).nullable(),
  pix_key: z.string().trim().max(200).nullable(),
}).strict().refine(v => Boolean(v.pix_key) === Boolean(v.pix_key_type), { message: 'Informe a chave PIX e seu tipo juntos.' });

router.get('/account', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('users').select(FIELDS)
      .eq('id', req.user.id).eq('user_type', 'company').eq('is_active', true).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Empresa não encontrada.' });
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (err) { next(err); }
});

router.put('/account', async (req, res, next) => {
  try {
    const parsed = accountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados de recebimento inválidos.', details: parsed.error.issues.map(i => ({ path: i.path, message: i.message })) });
    const { data, error } = await supabase.from('users').update(parsed.data)
      .eq('id', req.user.id).eq('user_type', 'company').eq('is_active', true).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Empresa não encontrada.' });
    // Não registrar dados bancários ou chave PIX no histórico.
    await supabase.from('audit_logs').insert({ user_id: req.actorId || req.user.id, entity_type: 'users', entity_id: req.user.id, action_type: 'update', new_values_json: { company_receiving_account_updated: true, ...(req.actorId ? { por_admin: true } : {}) } });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/commissions', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('booking_payouts')
      .select('id, amount, status, paid_at, created_at, operator:users!booking_payouts_origin_operator_id_fkey(full_name), bookings(booking_code,service_date)')
      .eq('payee_user_id', req.user.id)
      .eq('kind', 'commission')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50);
    res.set('Cache-Control', 'no-store');
    // Migração 129 ainda não rodada: sem vínculo não há comissão da empresa.
    if (semVinculoNoBanco(error)) return res.json({ rows: [], pendente: true });
    if (error) throw error;
    res.json({ rows: data || [] });
  } catch (err) { next(err); }
});

export default router;
