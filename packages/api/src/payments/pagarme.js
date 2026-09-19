const BASE = 'https://api.pagar.me/core/v5'

// Cria um recebedor no Pagar.me (o destino da fatia do operador no split).
// Devolve o id (re_xxx) que entra na regra de split de cada cobrança.
//
// Fail-closed e SEM inventar dado: sem documento, ou sem uma forma de repasse
// de verdade (PIX ou conta com código de banco), a função recusa com uma
// mensagem acionável em vez de mandar um recebedor pela metade para o gateway.
export async function createRecipient(user, apiKey, env = 'sandbox') {
  if (!apiKey) throw new Error('API Key do Pagar.me não configurada em Configurações → Pagamentos')

  const doc = String(user.document_number || '').replace(/\D/g, '')
  if (!doc) {
    throw new Error('Cadastre seu CPF ou CNPJ no perfil antes de ativar o recebimento automático')
  }
  const isCompany = user.document_type === 'cnpj' || doc.length === 14

  const temPix = !!(user.pix_key && user.pix_key_type)

  // Conta bancária só entra com o CÓDIGO do banco (febraban, 3 dígitos). O
  // perfil guarda o nome do banco como texto livre ("Nubank"), sem código — e o
  // Pagar.me exige o código. Antes, o campo `bank` recebia os 3 primeiros
  // dígitos da AGÊNCIA, o que apontava para um banco aleatório. Enquanto não
  // coletarmos o código de verdade, o repasse vai pela chave PIX.
  const bankCode = String(user.bank_code || '').replace(/\D/g, '')
  const temConta = bankCode.length === 3 && !!user.bank_account_number && !!user.bank_agency

  if (!temPix && !temConta) {
    throw new Error('Cadastre uma chave PIX no perfil para receber sua parte automaticamente')
  }

  const auth = Buffer.from(`${apiKey}:`).toString('base64')

  const body = {
    name:          user.full_name,
    email:         user.email,
    document:      doc,
    document_type: isCompany ? 'cnpj' : 'cpf',
    type:          isCompany ? 'company' : 'individual',
    // Referência externa = id do operador. Deixa reconciliar recebedor↔usuário
    // depois sem ter de casar nome ou documento.
    ...(user.id ? { code: String(user.id) } : {}),
    ...(temPix ? { pix_key: { type: user.pix_key_type, key: String(user.pix_key).trim() } } : {}),
    ...(temConta ? {
      default_bank_account: {
        holder_name:     user.full_name,
        holder_type:     isCompany ? 'company' : 'individual',
        holder_document: String(user.bank_document || doc).replace(/\D/g, ''),
        bank:            bankCode,
        branch_number:   String(user.bank_agency).replace(/\D/g, ''),
        account_number:  String(user.bank_account_number).replace(/\D/g, ''),
        type:            user.bank_account_type === 'poupanca' ? 'savings' : 'checking',
      },
    } : {}),
  }

  const res = await fetch(`${BASE}/recipients`, {
    method:  'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // A mensagem do Pagar.me é sobre os DADOS do operador ("document is
    // invalid") — acionável e não é segredo, então pode ir para ele. O corpo
    // completo, que pode trazer mais dado, fica no log.
    console.error('[pagarme] criar recebedor falhou:', res.status, JSON.stringify(data).slice(0, 300))
    throw new Error(data.message || `Pagar.me recusou o cadastro do recebedor (${res.status})`)
  }

  return data.id
}

// Lista os recebedores da conta. Só leitura, usada pelo admin para descobrir o
// `re_...` da própria plataforma sem ter de caçá-lo no painel do gateway —
// que foi exatamente onde a integração do split emperrou.
export async function listarRecebedores(apiKey, pagina = 1) {
  if (!apiKey) throw new Error('API Key do Pagar.me não configurada em Configurações → Pagamentos')
  const auth = Buffer.from(`${apiKey}:`).toString('base64')
  const r = await fetch(`${BASE}/recipients?page=${Number(pagina) || 1}&size=30`, {
    headers: { Authorization: `Basic ${auth}` },
  })
  if (!r.ok) {
    const corpo = await r.text().catch(() => '')
    const e = new Error(`Pagar.me respondeu ${r.status} ao listar recebedores`)
    e.status = r.status >= 400 && r.status < 500 ? 422 : 502
    // O corpo pode trazer dado do recebedor — fica no log, não na resposta.
    console.error('[pagarme] listar recebedores falhou:', r.status, corpo.slice(0, 300))
    throw e
  }
  const json = await r.json().catch(() => ({}))
  // Devolve só o que serve para escolher: id, nome, documento mascarado e
  // status. Nada de conta bancária ou chave PIX numa tela de configuração.
  return (json?.data || []).map((x) => ({
    id:       x.id,
    nome:     x.name,
    status:   x.status,
    tipo:     x.type,
    documento: String(x.document || '').replace(/^(\d{3})\d+(\d{2})$/, '$1***$2'),
  }))
}
