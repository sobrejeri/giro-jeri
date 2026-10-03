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

// ── Split (divisão automática) ───────────────────────────────────────────────
// Quando o split está ligado (system_settings.payment_platform_receives_all =
// 'false') E o DONO do lote conectou a conta Mercado Pago (OAuth), a cobrança
// Pix nasce NA CONTA DELE com a comissão da plataforma retida (application_fee).
// Fail-closed: qualquer incerteza (flag lida com erro, sem conta conectada,
// comissão que não fecha) → devolve null e o valor cai inteiro na plataforma,
// que repassa pela tela de Repasses. Errar para "fica com a plataforma" se
// corrige com repasse; mandar para conta de terceiro é irreversível.
async function contextoSplit(reserva) {
  try {
    if (!reserva?.lot_id) return null
    const { data: lot } = await supabase.from('parking_lots')
      .select('owner_user_id, commission_pct').eq('id', reserva.lot_id).maybeSingle()
    if (!lot?.owner_user_id) return null

    // Mesma chave que o admin liga em Configurações ("Dividir a cobrança no ato").
    // Estacionamento é sempre de UM operador (o dono do lote) e sem executor
    // fixo, então basta essa chave ligada (ou o antigo payment_platform_receives_all
    // = 'false') para dividir. Fail-closed: na dúvida, não divide.
    const { data: cfgRows } = await supabase.from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['payment_split_single_operator', 'payment_platform_receives_all'])
    const cfg = Object.fromEntries((cfgRows || []).map((s) => [s.setting_key, s.setting_value]))
    const splitLigado = String(cfg.payment_split_single_operator) === 'true'
    const recebeTudo = cfg.payment_platform_receives_all == null || cfg.payment_platform_receives_all === ''
      ? true : String(cfg.payment_platform_receives_all) !== 'false'
    if (!splitLigado && recebeTudo) return null

    const { getOperatorMp } = await import('../../routes/payments.js')
    const mp = await getOperatorMp(lot.owner_user_id)
    if (!mp?.token) return null

    const pct = lot.commission_pct != null ? Number(lot.commission_pct)
      : (mp.platformPct != null ? Number(mp.platformPct) : 0)
    const total = Number(reserva.total_amount)
    const applicationFee = Math.round(total * (pct / 100) * 100) / 100
    if (!(applicationFee > 0) || applicationFee >= total) return null
    return { sellerAccessToken: mp.token, applicationFee, operatorId: lot.owner_user_id }
  } catch (e) {
    console.error('[parking split] falhou, caindo na plataforma:', e.message)
    return null
  }
}

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

  // Divisão automática: cobra na conta do operador com a comissão retida, se elegível.
  const split = await contextoSplit(reserva)

  const { createPixPayment } = await import('../../services/mercadoPago.js')
  const pix = await createPixPayment({
    amount: Number(reserva.total_amount),
    description: `Estacionamento ${reserva.code}`,
    payerEmail,
    payerName: cliente?.full_name,
    payerDoc: cliente?.document_number,
    externalRef: `${PARKING_REF_PREFIX}${reserva.id}`,
    sellerAccessToken: split?.sellerAccessToken,
    applicationFee: split?.applicationFee,
  })
  // split_operator_id permite ao polling/webhook consultar o pagamento na conta
  // certa (quando a cobrança nasceu na conta do operador).
  const raw = { pix_code: pix.pix_code, qr_base64: pix.qr_base64, expires_at: pix.expires_at, split_operator_id: split?.operatorId || null }
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
    .select('external_ref, status, raw_response').eq('reservation_id', reservationId).eq('gateway', 'mercadopago')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!pay?.external_ref) return { paid: false }

  try {
    const { getMpPaymentCompleto } = await import('../../services/mercadoPago.js')
    // Com split, a cobrança nasceu na conta do operador → consulta com o token dele.
    let sellerToken
    const opId = pay.raw_response?.split_operator_id
    if (opId) {
      try {
        const { getOperatorMp } = await import('../../routes/payments.js')
        const mp = await getOperatorMp(opId)
        sellerToken = mp?.token
      } catch { /* cai na conta da plataforma abaixo */ }
    }
    const mp = await getMpPaymentCompleto(pay.external_ref, sellerToken)
    if (mp?.status === 'approved') {
      await confirmarPixAprovado(reservationId)
      return { paid: true }
    }
    return { paid: false, status: mp?.status || 'pending' }
  } catch {
    return { paid: false }
  }
}
