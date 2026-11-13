import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { snapshotPayoutBeneficiary } from '../src/services/companyPayout.js'
const operator = { id: 'op', user_type: 'operator', is_active: true, company_id: 'co' }
const company = { id: 'co', user_type: 'company', is_active: true }
describe('atribuição de repasse', () => {
  it('preserva operador e empresa como identidades distintas', () => {
    assert.deepEqual(snapshotPayoutBeneficiary(operator, company), { ok: true, operatorId: 'op', beneficiaryId: 'co', beneficiaryType: 'company' })
  })
  it('não usa uma empresa diferente, inativa ou ausente', () => {
    for (const c of [null, { ...company, id: 'outra' }, { ...company, is_active: false }, { ...company, user_type: 'operator' }])
      assert.deepEqual(snapshotPayoutBeneficiary(operator, c), { ok: false, reason: 'invalid_company' })
  })
  it('mantém beneficiário individual sem vínculo', () => {
    assert.deepEqual(snapshotPayoutBeneficiary({ ...operator, company_id: null }), { ok: true, operatorId: 'op', beneficiaryId: 'op', beneficiaryType: 'operator' })
  })
  it('recusa operador inativo e não altera snapshot quando vínculo muda', () => {
    const snapshot = snapshotPayoutBeneficiary(operator, company)
    assert.deepEqual(snapshotPayoutBeneficiary({ ...operator, is_active: false }, company), { ok: false, reason: 'invalid_operator' })
    operator.company_id = 'outra'
    assert.equal(snapshot.beneficiaryId, 'co')
  })
})
