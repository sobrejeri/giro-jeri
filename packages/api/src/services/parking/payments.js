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

  // Aprovado no gateway → confirma a reserva atomicamente.
  const conf = await confirmarReserva(reserva.id)
  return { estado: 'approved', ...conf, external_ref: cobranca.pedido_id }
}
