import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prepareExternalBooking } from '../src/services/externalBooking.js'
const op = { id: 'operator', user_type: 'operator', is_active: true, company_id: 'company' }
const co = { id: 'company', user_type: 'company', is_active: true }
const data = { customer_name: ' Ana ', service_name: ' Voo ', service_date: '2026-12-01', service_time: '10:30', people_count: 2, total_amount: '1500.00', external_payment_status: 'paid', executor_amount: '200.00' }
describe('reserva externa', () => {
  it('vincula ao operador e empresa autenticados e ignora campos financeiros recebidos do cliente', () => {
    const r = prepareExternalBooking({ ...data, operator_id: 'other', company_id: 'other', source: 'platform', gateway_name: 'pagarme', payment_status: 'approved' }, op, co)
    assert.equal(r.operator_id, 'operator'); assert.equal(r.company_id, 'company'); assert.equal(r.source, 'external')
    assert.equal(r.external_payment_status, 'paid'); assert.equal(r.customer_name, 'Ana')
    assert.equal('gateway_name' in r, false); assert.equal('payment_status' in r, false)
  })
  it('recusa vínculo ausente, empresa errada ou conta inativa', () => {
    for (const [actor, company] of [[{ ...op, company_id: null }, co], [op, { ...co, id: 'other' }], [op, { ...co, is_active: false }], [{ ...op, is_active: false }, co]]) assert.throws(() => prepareExternalBooking(data, actor, company))
  })
  it('recusa dados incorretos e quantias sem precisão monetária', () => {
    for (const patch of [{ service_date: '2026-02-30' }, { total_amount: '-1' }, { total_amount: '1.001' }, { executor_amount: 'NaN' }, { people_count: 0 }, { external_payment_status: 'approved' }, { service_time: '24:00' }]) assert.throws(() => prepareExternalBooking({ ...data, ...patch }, op, co))
  })
})
