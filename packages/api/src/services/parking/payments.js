// ── parking/payments.js — Pagamento do estacionamento (fase 4) ───────────────
//
// Reaproveita o gateway existente (Pagar.me, cartão inline) e centraliza a
// CONFIRMAÇÃO atômica (hold → confirmado) via a função SQL. A confirmação só
// acontece depois do estado verificado pelo backend junto ao gateway — nunca
// por retorno do navegador. Idempotente: webhook duplicado / dupla tentativa
// não confirmam duas vezes.

import { supabase } from '../../supabase.js'

// Lê as configurações de pagamento (mesma fonte do fluxo de passeios/translados).
async function getPaymentSettings() {
  const { data = [] } = await supabase
    .from('system_settings')
    .select('setting_key, setting_value')
    .like('setting_key', 'payment_%')
  return Object.fromEntries((data || []).map((s) => [s.setting_key, s.setting_value]))
}

// Registra/atualiza uma tentativa de pagamento de forma idempotente pela chave.
export async function registrarTentativa({ reservationId, gateway, amount, idempotencyKey }) {
  const { data, error } = await supabase
    .from('parking_payments')
    .upsert(
      { reservation_id: reservationId, gateway, amount, idempotency_key: idempotencyKey, status: 'pending' },
      { onConflict: 'idempotency_key', ignoreDuplicates: false },
    )
    .select('id, status')
    .single()
  if (error) throw error
  return data
}

export async function marcarTentativa(id, patch) {
  await supabase.from('parking_payments').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
}

// Confirma a reserva ATOMICAMENTE (hold → confirmado, revalidando a vaga).
// Retorna { ok, already?, no_capacity? }.
export async function confirmarReserva(reservationId) {
  const { data, error } = await supabase.rpc('parking_confirm_payment', { p_reservation_id: reservationId })
  if (error) throw error
  if (data?.ok) return { ok: true, already: !!data.already }
  return { ok: false, no_capacity: data?.error === 'no_capacity', error: data?.error }
}

// Cobra no cartão (Pagar.me inline) e, se aprovado, confirma a reserva.
// Sem split por enquanto (a plataforma recebe e repassa manualmente, igual ao
// restante hoje). Pix/Mercado Pago ficam para uma fase seguinte.
export async function cobrarCartaoEConfirmar({ reserva, cliente, cardToken, parcelas = 1, idempotencyKey }) {
  const cfg = await getPaymentSettings()
  const { chaveDoPagarme } = await import('../../routes/payments.js')
  const apiKey = chaveDoPagarme(cfg)
  if (!apiKey) {
    const e = new Error('Pagamento por cartão indisponível no momento.')
    e.status = 503
    throw e
  }

  const tentativa = await registrarTentativa({
    reservationId: reserva.id, gateway: 'pagarme', amount: reserva.total_amount, idempotencyKey,
  })
  // Já aprovada antes (reenvio): não cobra de novo, só garante a confirmação.
  if (tentativa.status === 'approved') {
    const conf = await confirmarReserva(reserva.id)
    return { estado: 'approved', ...conf, reused: true }
  }

  const { criarCobrancaCartao } = await import('../../payments/pagarmeCheckout.js')
  const cobranca = await criarCobrancaCartao({
    apiKey,
    amount:        reserva.total_amount,
    description:   `Estacionamento ${reserva.code}`,
    bookingId:     reserva.code,
    clienteNome:   cliente?.full_name,
    clienteEmail:  cliente?.email,
    clienteDoc:    cliente?.document_number,
    clienteTelefone: cliente?.phone,
    cardToken,
    parcelas,
    item: { id: reserva.id, title: `Estacionamento ${reserva.code}` },
  })

  await marcarTentativa(tentativa.id, {
    status: cobranca.estado === 'approved' ? 'approved' : (cobranca.estado === 'failed' ? 'failed' : 'pending'),
    external_ref: cobranca.pedido_id,
    raw_response: cobranca.raw,
  })

  if (cobranca.estado !== 'approved') {
    return { estado: cobranca.estado, motivo: cobranca.motivo }
  }

  return finalizarAprovado(reserva, cobranca)
}

// Extrai a confirmação pós-aprovação (reusada pela extensão quando delta>0).
async function finalizarAprovado(reserva, cobranca) {
  // Aprovado no gateway → confirma a reserva atomicamente.
  const conf = await confirmarReserva(reserva.id)
  // Gera o código de entrada (não-secreto) para o cliente dar entrada no pátio.
  if (conf.ok) {
    try {
      const { garantirCodigoEntrada } = await import('./entry.js')
      await garantirCodigoEntrada(reserva.id)
    } catch { /* código de entrada é melhor-esforço; não derruba o pagamento */ }
  }
  return { estado: 'approved', ...conf, external_ref: cobranca.pedido_id }
}

// Aplica a extensão atomicamente (cresce bloqueio + janela + total). Retorna
// { ok, already?, no_capacity? }.
export async function aplicarExtensao({ reservationId, newEndAt, newUnits, newTotal }) {
  const { data, error } = await supabase.rpc('parking_apply_extension', {
    p_reservation_id: reservationId, p_new_end_at: newEndAt, p_new_units: newUnits, p_new_total: newTotal,
  })
  if (error) throw error
  if (data?.ok) return { ok: true, already: !!data.already }
  return { ok: false, no_capacity: data?.error === 'no_capacity', error: data?.error }
}

// Cobra a DIFERENÇA da extensão no cartão e, se aprovado, aplica a extensão.
// Quando o delta é zero (mesma faixa de diária), aplica sem cobrar.
export async function cobrarExtensaoEAplicar({ reserva, cliente, novo, cardToken, parcelas = 1, idempotencyKey }) {
  const delta = Math.round((Number(novo.total) - Number(reserva.total_amount)) * 100) / 100
  if (delta <= 0) {
    const ap = await aplicarExtensao({ reservationId: reserva.id, newEndAt: novo.end_at, newUnits: novo.units, newTotal: novo.total })
    return { estado: 'approved', ...ap, delta: 0 }
  }

  const cfg = await getPaymentSettings()
  const { chaveDoPagarme } = await import('../../routes/payments.js')
  const apiKey = chaveDoPagarme(cfg)
  if (!apiKey) { const e = new Error('Pagamento por cartão indisponível no momento.'); e.status = 503; throw e }

  const tentativa = await registrarTentativa({ reservationId: reserva.id, gateway: 'pagarme', amount: delta, idempotencyKey })
  if (tentativa.status === 'approved') {
    const ap = await aplicarExtensao({ reservationId: reserva.id, newEndAt: novo.end_at, newUnits: novo.units, newTotal: novo.total })
    return { estado: 'approved', ...ap, reused: true, delta }
  }

  const { criarCobrancaCartao } = await import('../../payments/pagarmeCheckout.js')
  const cobranca = await criarCobrancaCartao({
    apiKey, amount: delta, description: `Extensão estacionamento ${reserva.code}`, bookingId: reserva.code,
    clienteNome: cliente?.full_name, clienteEmail: cliente?.email, clienteDoc: cliente?.document_number,
    clienteTelefone: cliente?.phone, cardToken, parcelas,
    item: { id: reserva.id, title: `Extensão ${reserva.code}` },
  })
  await marcarTentativa(tentativa.id, {
    status: cobranca.estado === 'approved' ? 'approved' : (cobranca.estado === 'failed' ? 'failed' : 'pending'),
    external_ref: cobranca.pedido_id, raw_response: cobranca.raw,
  })
  if (cobranca.estado !== 'approved') return { estado: cobranca.estado, motivo: cobranca.motivo }

  const ap = await aplicarExtensao({ reservationId: reserva.id, newEndAt: novo.end_at, newUnits: novo.units, newTotal: novo.total })
  return { estado: 'approved', ...ap, delta, external_ref: cobranca.pedido_id }
}
