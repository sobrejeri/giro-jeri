// =============================================================================
// legFlow.js — checkout parcial do motor de pernas (Etapa 2, R3)
// =============================================================================
// Coop aceita → cliente é notificado e tem uma janela (configurável, padrão
// 15 min) para confirmar e pagar o(s) veículo(s) aceito(s) ou cancelar. Passada
// a janela sem pagamento, uma varredura LAZY (sem cron) cancela a reserva e as
// pernas e avisa o cliente ("veículo indisponível — faça nova solicitação").
//
// Tudo gated por booking_legs_engine_enabled: quando a flag está off, o prazo
// nunca é gravado e a varredura sai imediatamente — comportamento inalterado.
// =============================================================================
import { supabase } from '../supabase.js'
import { notifyUser } from './notify.js'
import { isBookingLegsEngineEnabled } from './featureFlags.js'

const DEFAULT_WINDOW_MIN = 15

export async function getLegPaymentWindowMinutes() {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'leg_payment_window_minutes')
      .maybeSingle()
    const n = Number(data?.setting_value)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_WINDOW_MIN
  } catch {
    return DEFAULT_WINDOW_MIN
  }
}

// Grava payment_deadline_at UMA vez e notifica o cliente conforme o estado
// (parcial: confirme e pague o aceito ou cancele; completo: pague p/ confirmar).
// Idempotente: se já houver prazo, não sobrescreve nem re-notifica (trava por
// `.is('payment_deadline_at', null)` contra corrida de dois aceites).
export async function ensurePaymentDeadlineAndNotify(bookingId, { comboComplete }) {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, user_id, booking_code, payment_deadline_at, service_datetime')
    .eq('id', bookingId)
    .maybeSingle()
  if (error) throw error
  if (!booking || booking.payment_deadline_at) return booking || null
  // Sem horário do passeio não dá pra ancorar o prazo — não trava a notificação.
  if (!booking.service_datetime) return booking

  // Prazo ancorado no PASSEIO: pagar até 15 min antes do horário agendado
  // (não um timer a partir do aceite). O cliente pode esperar o combo fechar.
  const deadline = new Date(new Date(booking.service_datetime).getTime() - 15 * 60_000).toISOString()

  const { data: upd, error: upErr } = await supabase
    .from('bookings')
    .update({ payment_deadline_at: deadline })
    .eq('id', bookingId)
    .is('payment_deadline_at', null)
    .select('id')
  if (upErr) throw upErr
  if (!upd?.length) return booking // outro aceite ganhou a corrida; já notificado

  const title = comboComplete ? 'Operador(s) aceitaram! 🎉' : 'Um veículo foi aceito 🚗'
  const body  = comboComplete
    ? `Seu pedido (${booking.booking_code}) foi aceito. Pague até 15 min antes do passeio para confirmar.`
    : `Um operador aceitou parte do seu pedido (${booking.booking_code}). Confirme e pague o veículo aceito, ou cancele — até 15 min antes do passeio.`

  await notifyUser({
    userId:      booking.user_id,
    bookingId:   booking.id,
    templateKey: comboComplete ? 'booking_accepted' : 'booking_partial_accepted',
    title,
    body,
  }).catch((e) => console.error('[legFlow] notifyUser aceite falhou booking=%s:', bookingId, e.message))

  return { ...booking, payment_deadline_at: deadline }
}

// Varredura LAZY: cancela reservas cujo prazo de pagamento venceu sem pagamento,
// cancelando as pernas ainda vivas e avisando o cliente. Idempotente — só age em
// reservas ainda pendentes e não pagas. Barata: consulta indexada (índice
// parcial da migration 047), normalmente 0 linhas. Inerte com a flag off.
export async function sweepExpiredLegBookings() {
  if (!(await isBookingLegsEngineEnabled())) return 0

  // Cancelamento ancorado no horário do passeio (migration 048): cancela em SQL
  // reservas não pagas passadas de service−15min, e as não-aceitas por ninguém
  // passadas de service−20min (5 min antes). Devolve as canceladas p/ notificar.
  const { data: cancelledRows, error } = await supabase.rpc('cancel_overdue_leg_bookings')
  if (error) { console.error('[legFlow] varredura falhou:', error.message); return 0 }
  if (!cancelledRows?.length) return 0

  for (const b of cancelledRows) {
    notifyUser({
      userId:      b.user_id,
      bookingId:   b.id,
      templateKey: 'booking_expired_unavailable',
      title:       'Corrida cancelada',
      body:        `Ninguém confirmou a tempo e o veículo ficou indisponível. Faça uma nova solicitação (${b.booking_code}).`,
    }).catch((e) => console.error('[legFlow] notify varredura falhou booking=%s:', b.id, e.message))
  }
  return cancelledRows.length
}
