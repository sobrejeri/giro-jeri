import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { semVinculoNoBanco } from '../lib/vinculoEmpresa.js';
import companyTeam from './companyTeam.js';
import companyBookings from './companyBookings.js';

const router = Router();
router.use(authenticate, requireRole('company'));
router.use(companyTeam);   // /team — equipe de operadores da empresa
router.use(companyBookings);   // /bookings — reservas e desempenho da equipe
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
    await supabase.from('audit_logs').insert({ user_id: req.user.id, entity_type: 'users', entity_id: req.user.id, action_type: 'update', new_values_json: { company_receiving_account_updated: true } });
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
