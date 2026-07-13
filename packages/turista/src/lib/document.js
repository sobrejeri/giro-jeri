// Validação de CPF/CNPJ pelos dígitos verificadores (mesma lógica do backend —
// dupla camada: o app avisa na hora, o servidor barra de qualquer jeito).
export function isValidCPF(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += Number(d[i]) * (10 - i)
  let r = (s * 10) % 11
  if (r === 10) r = 0
  if (r !== Number(d[9])) return false
  s = 0
  for (let i = 0; i < 10; i++) s += Number(d[i]) * (11 - i)
  r = (s * 10) % 11
  if (r === 10) r = 0
  return r === Number(d[10])
}

export function isValidCNPJ(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calc = (weights) => {
    const s = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  if (calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) !== Number(d[12])) return false
  return calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[13])
}

export function validateBrDoc(type, number) {
  if (!number) return null
  if (type === 'cpf'  && !isValidCPF(number))  return 'CPF inválido — confira os dígitos.'
  if (type === 'cnpj' && !isValidCNPJ(number)) return 'CNPJ inválido — confira os dígitos.'
  return null
}
