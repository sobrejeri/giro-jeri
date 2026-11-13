/**
 * Resolve a titularidade do recebimento com base em perfis já consultados pelo
 * servidor. O vínculo e o perfil da empresa devem vir do banco, nunca do body.
 * Uma empresa inválida ou sem conta não pode cair na conta do funcionário.
 */
export function resolveRecipientOwner(operator, company = null) {
  if (!operator?.id || operator.user_type !== 'operator' || operator.is_active !== true) {
    return { ok: false, reason: 'invalid_operator' }
  }
  if (!operator.company_id) {
    return { ok: true, ownerId: operator.id, ownerType: 'operator' }
  }
  if (!company || company.id !== operator.company_id || company.user_type !== 'company' || company.is_active !== true) {
    return { ok: false, reason: 'invalid_company' }
  }
  return { ok: true, ownerId: company.id, ownerType: 'company' }
}

/** A validação da conta depende do gateway ou do repasse manual escolhido. */
export function resolveGatewayRecipient(operator, company = null) {
  const owner = resolveRecipientOwner(operator, company)
  if (!owner.ok) return owner
  const profile = owner.ownerType === 'company' ? company : operator
  const recipientId = String(profile.gateway_recipient_id || '').trim()
  if (!recipientId) return { ok: false, reason: 'missing_recipient' }
  return { ...owner, recipientId }
}
