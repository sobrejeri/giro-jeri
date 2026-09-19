// Cadastro de recebedor do operador no Pagar.me (o destino da fatia dele no
// split). Três metades:
//
// 1. `createRecipient` monta o corpo certo e RECUSA (sem chamar o gateway)
//    quando falta dado. O Pagar.me EXIGE conta bancária — provado em produção:
//    "The default_bank_account field is required." A chave PIX sozinha não
//    basta. E o código do banco (febraban) NUNCA sai dos dígitos da agência —
//    esse era o bug antigo (agência "1234" virava banco 123).
//
// 2. A rota self-service do operador é só dos dados DELE, idempotente e usa a
//    MESMA chave da cobrança.
//
// 3. Status ao vivo e link de KYC para resolver pendências.
//
// Nenhuma chamada real ao Pagar.me: o fetch é interceptado.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

process.env.SUPABASE_URL ||= 'https://exemplo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste'

const { createRecipient, codigoDoBanco } = await import('../src/payments/pagarme.js')

function interceptar(resposta = { ok: true, status: 200, json: async () => ({ id: 're_novo', status: 'registration' }) }) {
  const original = globalThis.fetch
  const chamadas = []
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), init })
    return { ok: true, status: 200, text: async () => '', ...resposta }
  }
  return { chamadas, restaurar: () => { globalThis.fetch = original } }
}

// Operador completo: CNPJ + conta bancária (banco pelo nome "260 - Nubank",
// como o seletor salva) + PIX como extra.
const OPERADOR = {
  id: 'op-1', full_name: 'Copper Transportes', email: 'copper@exemplo.com',
  document_type: 'cnpj', document_number: '20.653.342/0001-18',
  bank_name: '260 - Nubank', bank_agency: '0001', bank_account_number: '55555-0',
  bank_account_type: 'corrente',
  pix_key_type: 'cpf', pix_key: '39053344705',
}

// ── codigoDoBanco ──────────────────────────────────────────────────────────

test('o código do banco vem do bank_code, ou dos 3 dígitos à esquerda do nome', () => {
  assert.equal(codigoDoBanco({ bank_code: '260' }), '260')
  assert.equal(codigoDoBanco({ bank_name: '260 - Nubank' }), '260')
  assert.equal(codigoDoBanco({ bank_name: '001 — Banco do Brasil' }), '001')
  assert.equal(codigoDoBanco({ bank_name: 'Nubank' }), '', 'nome sem código não vira código')
  assert.equal(codigoDoBanco({ bank_agency: '1234' }), '', 'agência NUNCA é código de banco')
})

// ── createRecipient: monta e recusa ────────────────────────────────────────

test('sem API Key não chama o gateway', async () => {
  const i = interceptar()
  try {
    await assert.rejects(() => createRecipient(OPERADOR, ''), /API Key/)
    assert.equal(i.chamadas.length, 0)
  } finally { i.restaurar() }
})

test('sem documento, recusa sem chamar o gateway', async () => {
  const i = interceptar()
  try {
    await assert.rejects(() => createRecipient({ ...OPERADOR, document_number: '' }, 'sk_test'), /CPF ou CNPJ/)
    assert.equal(i.chamadas.length, 0)
  } finally { i.restaurar() }
})

test('sem conta bancária completa, recusa — PIX sozinho não basta', async () => {
  const i = interceptar()
  try {
    await assert.rejects(
      () => createRecipient({ id: 'x', full_name: 'X', email: 'x@x.com',
        document_type: 'cpf', document_number: '39053344705',
        pix_key_type: 'cpf', pix_key: '39053344705' }, 'sk_test'),
      /banco|agência|conta|Dados Bancários/)
    assert.equal(i.chamadas.length, 0, 'não pode chamar o gateway sem conta bancária')
  } finally { i.restaurar() }
})

test('banco sem código (nome livre) recusa — e a agência não vira código', async () => {
  const i = interceptar()
  try {
    await assert.rejects(
      () => createRecipient({ ...OPERADOR, bank_name: 'Nubank', bank_agency: '1234' }, 'sk_test'),
      /banco|Dados Bancários/)
    assert.equal(i.chamadas.length, 0, 'sem código de banco, nada é enviado')
  } finally { i.restaurar() }
})

test('com conta completa, monta default_bank_account e devolve o id', async () => {
  const i = interceptar()
  try {
    const id = await createRecipient(OPERADOR, 'sk_test')
    assert.equal(id, 're_novo')
    assert.equal(i.chamadas.length, 1)
    const [c] = i.chamadas
    assert.match(c.url, /\/core\/v5\/recipients$/)
    assert.match(c.init.headers.Authorization, /^Basic /)
    const body = JSON.parse(c.init.body)
    assert.equal(body.document, '20653342000118', 'documento só com dígitos')
    assert.equal(body.type, 'company')
    assert.equal(body.code, 'op-1')
    const conta = body.default_bank_account
    assert.ok(conta, 'a conta bancária é obrigatória para o Pagar.me')
    assert.equal(conta.bank, '260', 'código vem do nome "260 - Nubank", nunca da agência')
    assert.equal(conta.branch_number, '0001')
    assert.equal(conta.account_number, '55555', 'número sem o dígito verificador')
    assert.equal(conta.account_check_digit, '0', 'o dígito verificador vai separado')
    assert.equal(conta.type, 'checking')
    // PIX é extra quando existe, não substitui a conta.
    assert.deepEqual(body.pix_key, { type: 'cpf', key: '39053344705' })
  } finally { i.restaurar() }
})

test('poupança e código pelo bank_code também funcionam', async () => {
  const i = interceptar()
  try {
    await createRecipient({ ...OPERADOR, bank_name: '', bank_code: '104',
      bank_account_type: 'poupanca', bank_account_number: '12345-6' }, 'sk_test')
    const conta = JSON.parse(i.chamadas[0].init.body).default_bank_account
    assert.equal(conta.bank, '104')
    assert.equal(conta.type, 'savings')
    assert.equal(conta.account_check_digit, '6')
  } finally { i.restaurar() }
})

test('erro do gateway vira mensagem — corpo bruto fica no log', async () => {
  const i = interceptar({ ok: false, status: 422, json: async () => ({ message: 'document is invalid' }) })
  try {
    await assert.rejects(() => createRecipient(OPERADOR, 'sk_test'), /document is invalid/)
  } finally { i.restaurar() }
})

// ── A rota self-service (verificação por leitura da fonte) ──────────────────

const rota = fs.readFileSync(new URL('../src/routes/operator.js', import.meta.url), 'utf8')

test('a rota registra o recebedor SÓ do próprio operador', () => {
  const i = rota.indexOf("router.post('/register-recipient'")
  assert.notEqual(i, -1, 'rota self-service não encontrada')
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /\.eq\('id', req\.user\.id\)/, 'os dados são do operador logado, não de :id')
  assert.ok(!/req\.params\.id/.test(fn), 'nada de id vindo da URL')
})

test('a rota é idempotente — não cria um segundo recebedor', () => {
  const i = rota.indexOf("router.post('/register-recipient'")
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /if \(user\.gateway_recipient_id\)/)
  assert.match(fn, /already: true/)
})

test('a rota usa a MESMA chave da cobrança e registra auditoria', () => {
  const i = rota.indexOf("router.post('/register-recipient'")
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /chaveDoPagarme/)
  assert.match(fn, /gateway_recipient_id: recipientId/)
  assert.match(fn, /register_recipient_self/)
})

test('o status exige conta bancária (não PIX) e não vaza o id inteiro', () => {
  const i = rota.indexOf("router.get('/recipient-status'")
  assert.notEqual(i, -1)
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /codigoDoBanco/, 'o que libera a ativação é a conta bancária com código')
  assert.match(fn, /missing\.push\('banco'\)/)
  assert.match(fn, /can_register/)
  assert.match(fn, /\.replace\(\/\^\(\.\{7\}\)\.\+\(\.\{4\}\)\$\//, 'o id vai mascarado')
})

test('o cliente do operador expõe os métodos', () => {
  const apiJs = fs.readFileSync(new URL('../../operador/src/lib/api.js', import.meta.url), 'utf8')
  assert.match(apiJs, /getRecipientStatus:\s*\(\) => request\('\/api\/operator\/recipient-status'\)/)
  assert.match(apiJs, /registerRecipient:\s*\(\) => request\('\/api\/operator\/register-recipient'/)
  assert.match(apiJs, /recipientKycLink:\s*\(\) => request\('\/api\/operator\/recipient-kyc-link'/)
})

// ── Status ao vivo e link de verificação ───────────────────────────────────

const { getRecipient, kycLink } = await import('../src/payments/pagarme.js')

test('getRecipient devolve só status e KYC — nunca conta bancária ou PIX', async () => {
  const i = interceptar({ ok: true, status: 200, json: async () => ({
    id: 're_x', status: 'active',
    default_bank_account: { account_number: '55555' },
    kyc_details: { status: 'approved' },
  }) })
  try {
    const info = await getRecipient('sk_test', 're_x')
    assert.deepEqual(info, { id: 're_x', status: 'active', kyc_status: 'approved' })
    assert.ok(!('default_bank_account' in info))
    assert.match(i.chamadas[0].url, /\/recipients\/re_x$/)
  } finally { i.restaurar() }
})

test('kycLink devolve a URL do link de verificação', async () => {
  const i = interceptar({ ok: true, status: 200, json: async () => ({ url: 'https://kyc.pagar.me/abc', base64_qrcode: 'iVBOR' }) })
  try {
    const r = await kycLink('sk_test', 're_x')
    assert.equal(r.url, 'https://kyc.pagar.me/abc')
    assert.match(i.chamadas[0].url, /\/recipients\/re_x\/kyc_link$/)
    assert.equal(i.chamadas[0].init.method, 'POST')
  } finally { i.restaurar() }
})

test('kycLink sem URL na resposta vira erro tratado', async () => {
  const i = interceptar({ ok: true, status: 200, json: async () => ({}) })
  try {
    await assert.rejects(() => kycLink('sk_test', 're_x'), /link de verificação/)
  } finally { i.restaurar() }
})

test('a rota de status consulta o Pagar.me ao vivo quando já cadastrado', () => {
  const i = rota.indexOf("router.get('/recipient-status'")
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /getRecipient/)
  assert.match(fn, /mapSituacaoRecebedor/)
  assert.match(fn, /catch \(e\)/, 'falha do gateway não derruba a tela')
})

test('a rota de KYC gera o link só do recebedor do próprio operador', () => {
  const i = rota.indexOf("router.post('/recipient-kyc-link'")
  assert.notEqual(i, -1)
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /\.eq\('id', req\.user\.id\)/)
  assert.ok(!/req\.params/.test(fn))
  assert.match(fn, /kycLink/)
})
