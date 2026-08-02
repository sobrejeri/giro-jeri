// ── services/affiliateCommission.js ─────────────────────
// Regra do produto: a comissão do afiliado só vale para serviço REALIZADO.
// Quando a reserva indicada é cancelada, a comissão correspondente é cancelada
// junto e o afiliado é avisado (ele já tinha recebido o aviso de "você ganhou
// uma comissão" no pagamento, então precisa saber que ela caiu).
//
// Idempotente: só age em comissões que ainda NÃO foram pagas. Uma comissão já
// paga (repasse PIX efetuado) NÃO é revertida automaticamente — vira caso de
// acerto manual do admin, e é sinalizada no log.
import { supabase } from '../supabase.js';
import { notifyUser } from './notify.js';

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Cancela a comissão de afiliado de uma reserva cancelada e avisa o afiliado.
 * @param {object} booking - reserva já cancelada (precisa de id/booking_code)
 * @returns {{ cancelled: number, skipped?: string }}
 */
export async function cancelAffiliateCommission(booking) {
  if (!booking?.id) return { cancelled: 0, skipped: 'sem reserva' };

  // Comissões de AFILIADO desta reserva (as de cooperativa têm affiliate_id nulo).
  const { data: rows, error } = await supabase
    .from('commissions')
    .select('id, affiliate_id, commission_amount, payout_status')
    .eq('booking_id', booking.id)
    .not('affiliate_id', 'is', null);
  if (error) throw error;
  if (!rows?.length) return { cancelled: 0, skipped: 'sem comissão' };

  let cancelled = 0;
  for (const c of rows) {
    if (c.payout_status === 'paid') {
      // Já repassada via PIX — não dá para desfazer sozinho; admin resolve.
      console.warn('[afiliado] comissão JÁ PAGA em reserva cancelada — acerto manual necessário booking=%s commission=%s valor=%s',
        booking.booking_code || booking.id, c.id, c.commission_amount);
      continue;
    }
    if (c.payout_status === 'cancelled') continue;   // idempotência

    const { error: updErr } = await supabase
      .from('commissions')
      .update({ payout_status: 'cancelled' })
      .eq('id', c.id)
      .neq('payout_status', 'paid');
    if (updErr) {
      console.error('[afiliado] falha ao cancelar comissão %s: %s', c.id, updErr.message);
      continue;
    }
    cancelled += 1;

    // Avisa o afiliado — app + WhatsApp (best-effort nos dois).
    notifyUser({
      userId:      c.affiliate_id,
      bookingId:   booking.id,
      templateKey: 'affiliate_commission_cancelled',
      title:       'Comissão cancelada',
      body:        `A reserva ${booking.booking_code || ''} que você indicou foi cancelada e o serviço não será realizado. A comissão de ${fmtBRL(c.commission_amount)} não entra no repasse.`,
    });

    try {
      const { notifyAffiliateCommissionCancelled } = await import('./whatsapp.js');
      notifyAffiliateCommissionCancelled(supabase, {
        affiliateId: c.affiliate_id,
        booking,
        amount:      c.commission_amount,
      }).catch((err) => console.error('[whatsapp] aviso de comissão cancelada falhou:', err.message));
    } catch (err) {
      console.error('[afiliado] import do whatsapp falhou:', err.message);
    }
  }

  return { cancelled };
}
