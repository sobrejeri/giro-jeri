// ── bookingExpiry.js — cancela reservas NÃO PAGAS cuja data já passou ─────────
//
// Uma solicitação/reserva de passeio ou translado que não foi paga e cuja data
// de serviço já ficou no passado não pode mais ser paga — ela entra para
// "Cancelada" automaticamente. Idempotente: o próprio UPDATE condicional
// (status não-pago + service_date < hoje) é a trava, então só transiciona cada
// reserva uma vez. Usado pelo agendador (periódico), pela listagem do cliente
// (visão imediata) e como trava no pagamento.

import { supabase } from '../supabase.js'

// Status "ativos e não pagos" — os únicos que podem virar cancelados por data.
// (awaiting_acceptance = aguardando aceite; awaiting_payment = aceita, aguardando
//  pagamento; payment_failed = tentativa recusada sem nova cobrança.)
export const NAO_PAGAS = ['awaiting_acceptance', 'awaiting_payment', 'payment_failed']

// Hoje no fuso de Jeri (America/Fortaleza), YYYY-MM-DD. A reserva vence quando a
// data de serviço é ANTERIOR a hoje — a do próprio dia ainda pode ser paga.
export function hojeJeri() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// Avisa o cliente (push) uma vez por reserva recém-cancelada. Fire-and-forget:
// não atrasa a varredura nem derruba nada.
function notificarCancelados(cancelados) {
  import('./notify.js').then(({ notifyUser }) => {
    for (const b of cancelados) {
      if (!b.user_id) continue
      const tipo = b.service_type === 'transfer' ? 'translado' : 'passeio'
      const dm = String(b.service_date || '').slice(0, 10).split('-')
      const dataBR = dm.length === 3 ? `${dm[2]}/${dm[1]}/${dm[0]}` : b.service_date
      notifyUser({
        userId: b.user_id, bookingId: b.id, templateKey: 'booking_cancelled',
        title: 'Reserva cancelada',
        body: `Seu ${tipo} (${b.booking_code}) foi cancelado: a data (${dataBR}) passou sem o pagamento. Faça uma nova solicitação se ainda quiser.`,
      }).catch(() => {})
    }
  }).catch(() => {})
}

// Cancela todas as reservas não pagas com data já vencida. Devolve as que
// acabaram de ser canceladas (vazio se nenhuma). Best-effort: erro só é logado.
export async function cancelExpiredUnpaidBookings() {
  const hoje = hojeJeri()
  const { data, error } = await supabase
    .from('bookings')
    .update({ status_commercial: 'cancelled', status_operational: 'cancelled' })
    .in('status_commercial', NAO_PAGAS)
    .lt('service_date', hoje)
    .select('id, user_id, booking_code, service_type, service_date')
  if (error) {
    console.error('[bookingExpiry] varredura falhou:', error.message)
    return []
  }
  const cancelados = data || []
  if (cancelados.length) notificarCancelados(cancelados) // não await — segue em background
  return cancelados
}
