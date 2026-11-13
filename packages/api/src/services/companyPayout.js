/**
 * Prepara a atribuição do beneficiário no momento de criar o repasse.
 * Os perfis precisam ter sido lidos no servidor; não aceitar IDs do cliente.
 * O snapshot deve ser gravado com o repasse: consultar o vínculo atual ao
 * liquidar faria uma reserva antiga mudar de empresa após uma transferência.
 */
export function snapshotPayoutBeneficiary(operator, company = null) {
  if (!operator?.id || operator.user_type !== 'operator' || operator.is_active !== true) {
    return { ok: false, reason: 'invalid_operator' }
  }
  if (!operator.company_id) {
    return { ok: true, operatorId: operator.id, beneficiaryId: operator.id, beneficiaryType: 'operator' }
  }
  if (!company || company.id !== operator.company_id || company.user_type !== 'company' || company.is_active !== true) {
    return { ok: false, reason: 'invalid_company' }
  }
  return { ok: true, operatorId: operator.id, beneficiaryId: company.id, beneficiaryType: 'company' }
}
