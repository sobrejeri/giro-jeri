const BASE = {
  production: 'https://api.asaas.com/api/v3',
  sandbox:    'https://sandbox.asaas.com/api/v3',
}

// Creates a sub-account in Asaas (required for marketplace split).
// Returns the walletId/accountId used in payment splits.
export async function createRecipient(user, apiKey, env = 'sandbox') {
  if (!apiKey) throw new Error('API Key do Asaas não configurada em Configurações → Pagamentos')

  const res = await fetch(`${BASE[env] || BASE.sandbox}/accounts`, {
    method:  'POST',
    headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name:        user.full_name,
      email:       user.email,
      cpfCnpj:     user.document_number?.replace(/\D/g, '') || '',
      mobilePhone: user.phone?.replace(/\D/g, '') || '',
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    const msg = data.errors?.[0]?.description || data.message || `Asaas erro ${res.status}`
    throw new Error(msg)
  }

  return data.walletId || data.id
}
