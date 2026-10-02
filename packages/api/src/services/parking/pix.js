// ── parking/pix.js — Pagamento via Pix (Mercado Pago) do estacionamento ──────
//
// Reaproveita o mesmo gerador de Pix dos passeios/translados (Mercado Pago), mas
// com external_reference próprio (parking:<reservation_id>) para o webhook saber
// que a cobrança é de estacionamento e confirmar via parking_confirm_payment —
// sem tocar no fluxo de bookings. A confirmação vem por webhook E por polling
// (conferirPix), então não depende do app ficar aberto.

import { supabase } from '../../supabase.js'
import { confirmarReserva } from './payments.js'

export const PARKING_REF_PREFIX = 'parking:'

// Cria (ou reusa) a cobrança Pix da reserva. Idempotente pela idempotency_key.
export async function criarPixEstacionamento({ reserva, cliente, email }) {
  const payerEmail = email || cliente?.email
  if (!payerEmail) { const e = new Error('Informe um e-mail para emitir o Pix.'); e.status = 400; throw e }

  const idem = `park-pix-${reserva.id}`
  // Reusa uma tentativa Pix pendente ainda válida (mesmo QR), em vez de abrir outra.
  const { data: existente } = await supabase.from('parking_payments')
    .select('id, status, external_ref, raw_response').eq('idempotency_key', idem).maybeSingle()
  if (existente?.status === 'pending' && existente.raw_response?.pix_code) {
    const raw = existente.raw_response
    if (!raw.expires_at || new Date(raw.expires_at).getTime() > Date.now()) {
      return { pix_code: raw.pix_code, qr_base64: raw.qr_base64, expires_at: raw.expires_at, mp_id: existente.external_ref }
    }
  }

  const { createPixPayment } = await import('../../services/mercadoPago.js')
  const pix = await createPixPayment({
    amount: Number(reserva.total_amount),
    description: `Estacionamento ${reserva.code}`,
    payerEmail,
    payerName: cliente?.full_name,
    payerDoc: cliente?.document_number,
    externalRef: `${PARKING_REF_PREFIX}${reserva.id}`,
  })
  const raw = { pix_code: pix.pix_code, qr_base64: pix.qr_base64, expires_at: pix.expires_at }
  await supabase.from('parking_payments').upsert({
    reservation_id: reserva.id, gateway: 'mercadopago', amount: reserva.total_amount,
    status: 'pending', external_ref: pix.mp_id, idempotency_key: idem, raw_response: raw,
  }, { onConflict: 'idempotency_key' })
  return { pix_code: pix.pix_code, qr_base64: pix.qr_base64, expires_at: pix.expires_at, mp_id: pix.mp_id }
}

// Confirma a reserva a partir de um pagamento MP já aprovado (usado pelo webhook).
export async function confirmarPixAprovado(reservationId) {
  const conf = await confirmarReserva(reservationId)
  if (conf.ok) {
    await supabase.from('parking_payments').update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('reservation_id', reservationId).eq('gateway', 'mercadopago').eq('status', 'pending')
    try { const { garantirCodigoEntrada } = await import('./entry.js'); await garantirCodigoEntrada(reservationId) } catch { /* melhor-esforço */ }
  }
  return conf
}

// Polling: consulta o MP pela cobrança da reserva e confirma se já aprovou.
export async function conferirPix(reservationId) {
  const { data: r } = await supabase.from('parking_reservations')
    .select('id, status, payment_status').eq('id', reservationId).maybeSingle()
  if (!r) return { paid: false, error: 'not_found' }
  if (r.payment_status === 'paid') return { paid: true }

  const { data: pay } = await supabase.from('parking_payments')
    .select('external_ref, status').eq('reservation_id', reservationId).eq('gateway', 'mercadopago')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!pay?.external_ref) return { paid: false }

  try {
    const { getMpPaymentCompleto } = await import('../../services/mercadoPago.js')
    const mp = await getMpPaymentCompleto(pay.external_ref)
    if (mp?.status === 'approved') {
      await confirmarPixAprovado(reservationId)
      return { paid: true }
    }
    return { paid: false, status: mp?.status || 'pending' }
  } catch {
    return { paid: false }
  }
}
