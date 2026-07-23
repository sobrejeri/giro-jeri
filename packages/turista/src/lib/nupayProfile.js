export function digits(value) {
  return String(value || '').replace(/\D/g, '')
}

export function isCpf(value) {
  const cpf = digits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  const checkDigit = (length) => {
    let sum = 0
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i)
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10])
}

export function getNupayProfileMissingFields(form = {}, user = {}) {
  const missing = []
  if (String(form.full_name || '').trim().length < 2) missing.push('full_name')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email || '').trim())) missing.push('email')
  const phone = digits(form.phone)
  if (phone.length < 10 || phone.length > 15) missing.push('phone')
  if (user.document_type !== 'cpf' || !isCpf(form.document_number)) missing.push('document_number')
  return missing
}

export function buildNupayProfilePayload(form = {}) {
  const fullName = String(form.full_name || '').trim()
  const email = String(form.email || '').trim()
  const phone = String(form.phone || '').trim()
  const documentNumber = digits(form.document_number)

  if (fullName.length < 2) throw new Error('Informe seu nome completo para pagar com NuPay.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido para pagar com NuPay.')
  if (digits(phone).length < 10 || digits(phone).length > 15) throw new Error('Informe um telefone válido para pagar com NuPay.')
  if (!isCpf(documentNumber)) throw new Error('NuPay exige CPF brasileiro válido.')

  return {
    full_name: fullName,
    email,
    phone,
    document_type: 'cpf',
    document_number: documentNumber,
  }
}
