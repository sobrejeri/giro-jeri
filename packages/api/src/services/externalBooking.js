// Uma reserva externa é um registro da empresa, não um pagamento Turiva.
// Nunca aceitar os identificadores de operador/empresa enviados pelo navegador.
const MONEY = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/
const STATUSES = new Set(['pending', 'paid'])

export function prepareExternalBooking(input, actor, company) {
  if (!actor || actor.user_type !== 'operator' || actor.is_active !== true || !actor.id || !actor.company_id ||
      !company || company.id !== actor.company_id || company.user_type !== 'company' || company.is_active !== true) {
    throw new Error('Operador sem empresa ativa vinculada.')
  }
  const text = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : ''
  const customerName = text(input?.customer_name, 150)
  const serviceName = text(input?.service_name, 200)
  const serviceDate = text(input?.service_date, 10)
  const total = String(input?.total_amount ?? '')
  const people = Number(input?.people_count)
  const paymentStatus = input?.external_payment_status || 'pending'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ? new Date(`${serviceDate}T00:00:00Z`) : null
  if (!customerName || !serviceName || !date || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== serviceDate ||
      !MONEY.test(total) || !Number.isInteger(people) || people < 1 || people > 1000 || !STATUSES.has(paymentStatus)) {
    throw new Error('Dados da reserva externa inválidos.')
  }
  const time = text(input?.service_time, 5)
  if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Horário inválido.')
  const payout = input?.executor_amount == null || input.executor_amount === '' ? null : String(input.executor_amount)
  if (payout !== null && !MONEY.test(payout)) throw new Error('Valor do repasse inválido.')
  return {
    company_id: company.id, operator_id: actor.id, source: 'external',
    customer_name: customerName, customer_phone: text(input?.customer_phone, 30) || null,
    service_name: serviceName, service_date: serviceDate, service_time: time || null,
    people_count: people, total_amount: total, external_payment_status: paymentStatus,
    executor_name: text(input?.executor_name, 150) || null, executor_amount: payout,
    notes: text(input?.notes, 2000) || null,
  }
}
