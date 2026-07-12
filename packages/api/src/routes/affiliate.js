// ── affiliate.js ────────────────────────────────────────
// Programa de afiliados "DIVULGOU, GANHOU": qualquer usuário logado ativa seu
// código com 1 toque (/a/<CÓDIGO> no app do turista) e ganha comissão sobre
// reservas pagas de quem indicou (% em system_settings, padrão 5%; repasse
// manual via PIX em até 7 dias — fora do split automático).
//
// Segurança: o resolve público expõe só o primeiro nome + foto (selo
// "Indicado por X"). A atribuição real acontece no servidor, em
// /payments/request e /payments/cart-request, resolvendo o código de novo lá
// (nunca aceita affiliate_id cru) e ignorando autoindicação.
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate } from '../middleware/auth.js';

export const affiliateRouter = Router();

// Resolve um código para o dono ativo dele (uso interno + resolve público).
export async function resolveAffiliate(code) {
  if (!code || typeof code !== 'string') return null;
  const { data } = await supabase
    .from('users')
    .select('id, full_name, profile_photo_url, affiliate_code')
    .ilike('affiliate_code', code.trim())
    .eq('is_active', true)
    .maybeSingle();
  return data || null;
}

// Gera um código legível: prefixo do primeiro nome + 4 alfanuméricos.
// Sem 0/O/1/I para não confundir quem digita o código de ouvido.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateCode(fullName = '') {
  const first = (fullName.trim().split(/\s+/)[0] || 'GIRO')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // remove acentos
    .replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6) || 'GIRO';
  let rand = '';
  for (let i = 0; i < 4; i++) rand += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${first}${rand}`;
}

// ── GET /api/affiliate/resolve/:code (público) ──────────
// Valida o código do link/indicação. Só nome + foto — nada sensível.
affiliateRouter.get('/resolve/:code', async (req, res, next) => {
  try {
    const a = await resolveAffiliate(req.params.code);
    if (!a) return res.status(404).json({ error: 'Código de indicação não encontrado' });
    res.json({
      code:  a.affiliate_code,
      name:  (a.full_name || '').split(/\s+/)[0] || 'Afiliado',
      photo: a.profile_photo_url || null,
    });
  } catch (err) { next(err); }
});

// ── POST /api/affiliate/activate (autenticado) ──────────
// Idempotente: já tem código → devolve o mesmo. Colisão de código (índice
// único) → tenta de novo com outro sufixo.
affiliateRouter.post('/activate', authenticate, async (req, res, next) => {
  try {
    const { data: me } = await supabase
      .from('users').select('affiliate_code, full_name').eq('id', req.user.id).single();
    if (me?.affiliate_code) return res.json({ code: me.affiliate_code, existing: true });

    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode(me?.full_name || req.user.full_name);
      const { error } = await supabase
        .from('users').update({ affiliate_code: code }).eq('id', req.user.id);
      if (!error) return res.json({ code, existing: false });
      lastErr = error; // 23505 = colisão do índice único → tenta outro código
    }
    console.error('[affiliate] falha ao gerar código user=%s err=%s', req.user.id, lastErr?.message);
    res.status(500).json({ error: 'Não foi possível gerar seu código agora — tente de novo.' });
  } catch (err) { next(err); }
});

// ── GET /api/affiliate/me (autenticado) ─────────────────
// Painel do afiliado: código + comissões (com código da reserva) + totais.
affiliateRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    // Percentual vigente (admin ajusta em Configurações/Afiliados)
    const { data: st } = await supabase
      .from('system_settings').select('setting_value')
      .eq('setting_key', 'affiliate_commission_percent').maybeSingle();
    const percent = Number(st?.setting_value ?? 5) || 5;

    const { data: me } = await supabase
      .from('users').select('affiliate_code').eq('id', req.user.id).single();
    if (!me?.affiliate_code) return res.json({ code: null, percent, commissions: [], totals: { pending: 0, paid: 0 } });

    const { data: commissions } = await supabase
      .from('commissions')
      .select('id, commission_percent, commission_amount, payout_status, payout_due_date, payout_paid_at, created_at, bookings ( booking_code, service_type, total_amount )')
      .eq('affiliate_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    const list = commissions || [];
    const sum = (st) => Math.round(list
      .filter((c) => c.payout_status === st)
      .reduce((s, c) => s + Number(c.commission_amount || 0), 0) * 100) / 100;

    res.json({
      code: me.affiliate_code,
      percent,
      commissions: list,
      totals: { pending: sum('pending') + sum('ready'), paid: sum('paid') },
    });
  } catch (err) { next(err); }
});
