// ── Status da reserva, para o cliente ───────────────────────────────────────
//
// UMA fonte de verdade, usada pela lista (Bookings.jsx) e pelo detalhe
// (BookingDetail.jsx). Antes eram duas cópias da mesma regra, e elas
// divergiram: a lista não tratava `payment_failed` e caía numa regra que
// declara "Confirmado" olhando só o estado OPERACIONAL.
//
// O resultado apareceu em produção: uma reserva com pagamento RECUSADO
// aparecia como "Confirmado · Total pago" na lista e "Aguardando pagamento"
// no detalhe. A tela mais visível era a que mentia — e um cliente que acredita
// nela aparece para o passeio sem ter pago.
//
// A regra que não pode ser quebrada: nada é "confirmado" sem que o comercial
// diga 'paid'. O estado operacional descreve o que o operador está fazendo,
// não se o dinheiro entrou.

const CUIDANDO = ['assigned', 'awaiting_dispatch', 'confirmed', 'en_route', 'dispatched']

// Estados comerciais em que o dinheiro AINDA NÃO entrou. Enquanto a reserva
// estiver num deles, nenhum estado operacional pode promovê-la a confirmada.
const SEM_PAGAMENTO = ['awaiting_acceptance', 'awaiting_payment', 'payment_failed']

export function resolveStatusReserva(b) {
  if (!b) return 'waiting_acceptance'
  const c = b.status_commercial
  const o = b.status_operational

  if (c === 'cancelled' || o === 'cancelled') return 'cancelled'
  if (c === 'expired'   || o === 'expired')   return 'expired'
  if (o === 'completed')                      return 'completed'
  if (o === 'in_progress')                    return 'in_progress'

  // Fluxo solicitar → aceitar → pagar.
  if (c === 'awaiting_acceptance') return 'waiting_acceptance'
  // `payment_failed` ANDA JUNTO com `awaiting_payment`: nos dois o cliente
  // ainda precisa pagar. Deixá-lo de fora foi o que produziu o "Confirmado"
  // numa reserva recusada.
  if (c === 'awaiting_payment' || c === 'payment_failed') return 'waiting_payment'

  // Pago: confirmado quando o operador já está cuidando; senão, ainda espera
  // alguém aceitar (fluxo antigo, em que o pagamento vinha primeiro).
  if (c === 'paid') return CUIDANDO.includes(o) ? 'confirmed' : 'waiting_acceptance'

  // Fluxo antigo sem estado comercial reconhecido: o operacional pode indicar
  // que a reserva está andando — mas NUNCA quando o comercial diz que falta
  // pagar. Sem esta guarda, "o operador aceitou" virava "está confirmado".
  if (CUIDANDO.includes(o) && !SEM_PAGAMENTO.includes(c)) return 'confirmed'

  return 'waiting_payment'
}

// O rótulo do valor só pode dizer "pago" quando de fato foi pago.
export function rotuloDoTotal(status) {
  return status === 'confirmed' || status === 'in_progress' || status === 'completed'
    ? 'Total pago'
    : 'Total'
}
