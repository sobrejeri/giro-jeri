const BASE = 'https://api.pagar.me/core/v5'

// Creates a recipient in Pagar.me (used for payment splits).
// Returns the recipient id (re_xxx) used in split rules.
export async function createRecipient(user, apiKey, env = 'sandbox') {
  if (!apiKey) throw new Error('API Key do Pagar.me não configurada em Configurações → Pagamentos')

  const auth = Buffer.from(`${apiKey}:`).toString('base64')

  const body = {
    name:          user.full_name,
    email:         user.email,
    document:      user.document_number?.replace(/\D/g, '') || '',
    document_type: user.document_type === 'cnpj' ? 'cnpj' : 'cpf',
    type:          user.document_type === 'cnpj' ? 'company' : 'individual',
    ...(user.pix_key ? {
      pix_key: { type: user.pix_key_type, key: user.pix_key },
    } : {}),
    ...(user.bank_account_number ? {
      default_bank_account: {
        holder_name:      user.full_name,
        holder_type:      user.document_type === 'cnpj' ? 'company' : 'individual',
        holder_document:  user.document_number?.replace(/\D/g, '') || '',
        bank:             user.bank_agency?.slice(0, 3) || '000',
        branch_number:    user.bank_agency || '',
        account_number:   user.bank_account_number,
        type:             user.bank_account_type === 'poupanca' ? 'savings' : 'checking',
      },
    } : {}),
  }

  const res = await fetch(`${BASE}/recipients`, {
    method:  'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.message || `Pagar.me erro ${res.status}`)
  }

  return data.id
}
