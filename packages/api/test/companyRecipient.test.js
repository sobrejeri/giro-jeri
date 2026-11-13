import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveRecipientOwner, resolveGatewayRecipient } from '../src/payments/companyRecipient.js'

const operator = { id: 'op', user_type: 'operator', is_active: true, gateway_recipient_id: 're_operator' }
const company = { id: 'co', user_type: 'company', is_active: true, gateway_recipient_id: 're_company' }
const linked = { ...operator, company_id: 'co' }

describe('titularidade de recebimento', () => {
  it('mantém o operador independente como titular', () => {
    assert.deepEqual(resolveGatewayRecipient(operator), { ok: true, ownerId: 'op', ownerType: 'operator', recipientId: 're_operator' })
  })
  it('usa o recebedor da empresa para o operador vinculado', () => {
    assert.deepEqual(resolveGatewayRecipient(linked, company), { ok: true, ownerId: 'co', ownerType: 'company', recipientId: 're_company' })
  })
  it('recusa empresa errada, inativa ou de outra função', () => {
    for (const profile of [null, { ...company, id: 'other' }, { ...company, is_active: false }, { ...company, user_type: 'operator' }]) {
      assert.deepEqual(resolveGatewayRecipient(linked, profile), { ok: false, reason: 'invalid_company' })
    }
  })
  it('nunca usa a conta pessoal quando a empresa não tem recebedor', () => {
    assert.deepEqual(resolveGatewayRecipient(linked, { ...company, gateway_recipient_id: '' }), { ok: false, reason: 'missing_recipient' })
  })
  it('recusa funcionário inativo', () => {
    assert.deepEqual(resolveRecipientOwner({ ...linked, is_active: false }, company), { ok: false, reason: 'invalid_operator' })
  })
  it('permite identificar o titular para repasse manual sem presumir gateway', () => {
    assert.deepEqual(resolveRecipientOwner(linked, { ...company, gateway_recipient_id: null }), { ok: true, ownerId: 'co', ownerType: 'company' })
  })
})
