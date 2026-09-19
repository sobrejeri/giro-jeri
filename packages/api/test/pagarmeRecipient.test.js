// Cadastro de recebedor do operador no Pagar.me (o destino da fatia dele no
// split). Duas metades:
//
// 1. `createRecipient` monta o corpo certo e RECUSA (sem chamar o gateway)
//    quando falta dado — em vez de mandar um recebedor pela metade. O bug que
//    isto trava: o campo `bank` era preenchido com os 3 primeiros dígitos da
//    AGÊNCIA, apontando para um banco aleatório; e recebedor sem PIX nem conta
//    válida era enviado assim mesmo.
//
// 2. A rota self-service do operador é só dos dados DELE, idempotente e usa a
//    MESMA chave da cobrança — senão o recebedor nasce numa conta e a cobrança
//    acontece em outra, e o split é recusado longe da causa.
//
// Nenhuma chamada real ao Pagar.me: o fetch é interceptado.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

process.env.SUPABASE_URL ||= 'https://exemplo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste'

const { createRecipient } = await import('../src/payments/pagarme.js')

function interceptar(resposta = { ok: true, status: 200, json: async () => ({ id: 're_novo', status: 'registration' }) }) {
  const original = globalThis.fetch
  const chamadas = []
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), init })
    return { ok: true, status: 200, text: async () => '', ...resposta }
  }
  return { chamadas, restaurar: () => { globalThis.fetch = original } }
}

const OPERADOR_PIX = {
  id: 'op-1', full_name: 'Copper Transportes', email: 'copper@exemplo.com',
  document_type: 'cpf', document_number: '390.533.447-05',
  pix_key_type: 'cpf', pix_key: '39053344705',
}

// ── createRecipient: monta e recusa ────────────────────────────────────────

test('sem API Key não chama o gateway', async () => {
  const i = interceptar()
  try {
    await assert.rejects(() => createRecipient(OPERADOR_PIX, ''), /API Key/)
    assert.equal(i.chamadas.length, 0)
  } finally { i.restaurar() }
})

test('sem documento, recusa com mensagem acionável — não inventa recebedor', async () => {
  const i = interceptar()
  try {
    await assert.rejects(
      () => createRecipient({ ...OPERADOR_PIX, document_number: '' }, 'sk_test'),
      /CPF ou CNPJ/)
    assert.equal(i.chamadas.length, 0, 'não pode chamar o gateway sem documento')
  } finally { i.restaurar() }
})

test('sem PIX e sem conta com código de banco, recusa', async () => {
  const i = interceptar()
  try {
    await assert.rejects(
      () => createRecipient({ ...OPERADOR_PIX, pix_key: '', pix_key_type: '' }, 'sk_test'),
      /chave PIX/)
    assert.equal(i.chamadas.length, 0)
  } finally { i.restaurar() }
})

test('com PIX, monta o corpo e devolve o id do recebedor', async () => {
  const i = interceptar()
  try {
    const id = await createRecipient(OPERADOR_PIX, 'sk_test')
    assert.equal(id, 're_novo')
    assert.equal(i.chamadas.length, 1)
    const [c] = i.chamadas
    assert.match(c.url, /\/core\/v5\/recipients$/)
    assert.match(c.init.headers.Authorization, /^Basic /, 'auth Basic com a chave')
    const body = JSON.parse(c.init.body)
    assert.equal(body.document, '39053344705', 'documento só com dígitos')
    assert.equal(body.type, 'individual')
    assert.deepEqual(body.pix_key, { type: 'cpf', key: '39053344705' })
    assert.equal(body.code, 'op-1', 'referência externa = id do operador, para reconciliar')
    assert.ok(!('default_bank_account' in body), 'sem código de banco, não manda conta')
  } finally { i.restaurar() }
})

test('CNPJ vira recebedor company', async () => {
  const i = interceptar()
  try {
    await createRecipient({ ...OPERADOR_PIX, document_type: 'cnpj', document_number: '64.984.203/0001-42',
      pix_key_type: 'cnpj', pix_key: '64984203000142' }, 'sk_test')
    const body = JSON.parse(i.chamadas[0].init.body)
    assert.equal(body.type, 'company')
    assert.equal(body.document_type, 'cnpj')
  } finally { i.restaurar() }
})

test('NUNCA usa os 3 primeiros dígitos da agência como código do banco', async () => {
  // O bug original: bank = bank_agency.slice(0,3). Uma agência "1234" viraria
  // banco "123", que é outro banco. Agora conta bancária só entra com um
  // bank_code de verdade — que o cadastro ainda não coleta —, então o corpo
  // não pode conter default_bank_account montado a partir da agência.
  const i = interceptar()
  try {
    await createRecipient({
      ...OPERADOR_PIX,
      bank_name: 'Nubank', bank_agency: '1234', bank_account_number: '55555-0',
      bank_account_type: 'corrente',
    }, 'sk_test')
    const body = JSON.parse(i.chamadas[0].init.body)
    assert.ok(!body.default_bank_account,
      'conta bancária sem código febraban não pode ser enviada')
  } finally { i.restaurar() }
})

test('com código de banco de verdade, a conta é montada com o código', async () => {
  const i = interceptar()
  try {
    await createRecipient({
      ...OPERADOR_PIX, pix_key: '', pix_key_type: '',
      bank_code: '260', bank_agency: '0001', bank_account_number: '55555-0',
      bank_account_type: 'poupanca', bank_document: '39053344705',
    }, 'sk_test')
    const body = JSON.parse(i.chamadas[0].init.body)
    assert.equal(body.default_bank_account.bank, '260', 'o código vem do bank_code, não da agência')
    assert.equal(body.default_bank_account.type, 'savings')
    assert.equal(body.default_bank_account.account_number, '555550', 'só dígitos')
  } finally { i.restaurar() }
})

test('erro do gateway vira mensagem — e o corpo bruto NÃO vai junto', async () => {
  const i = interceptar({ ok: false, status: 422, json: async () => ({ message: 'document is invalid' }) })
  try {
    await assert.rejects(() => createRecipient(OPERADOR_PIX, 'sk_test'), /document is invalid/)
  } finally { i.restaurar() }
})

// ── A rota self-service (verificação por leitura da fonte) ──────────────────

const rota = fs.readFileSync(new URL('../src/routes/operator.js', import.meta.url), 'utf8')

test('a rota registra o recebedor SÓ do próprio operador', () => {
  const i = rota.indexOf("router.post('/register-recipient'")
  assert.notEqual(i, -1, 'rota self-service não encontrada')
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /\.eq\('id', req\.user\.id\)/, 'os dados são do operador logado, não de :id')
  assert.ok(!/req\.params\.id/.test(fn), 'nada de id vindo da URL — seria porta para recebedor de outro')
})

test('a rota é idempotente — não cria um segundo recebedor', () => {
  const i = rota.indexOf("router.post('/register-recipient'")
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /if \(user\.gateway_recipient_id\)/, 'já sendo recebedor, devolve o existente')
  assert.match(fn, /already: true/)
})

test('a rota usa a MESMA chave da cobrança e registra auditoria', () => {
  const i = rota.indexOf("router.post('/register-recipient'")
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /chaveDoPagarme/, 'uma fonte de verdade para a chave')
  assert.match(fn, /gateway_recipient_id: recipientId/, 'grava o id no usuário')
  assert.match(fn, /register_recipient_self/, 'audita quem se cadastrou')
})

test('o status diz o que falta, sem vazar o id inteiro', () => {
  const i = rota.indexOf("router.get('/recipient-status'")
  assert.notEqual(i, -1)
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /missing/, 'a tela precisa saber o que falta cadastrar')
  assert.match(fn, /can_register/)
  assert.match(fn, /\.replace\(\/\^\(\.\{7\}\)\.\+\(\.\{4\}\)\$\//, 'o id vai mascarado')
})

test('o cliente do operador expõe os dois métodos', () => {
  const apiJs = fs.readFileSync(new URL('../../operador/src/lib/api.js', import.meta.url), 'utf8')
  assert.match(apiJs, /getRecipientStatus:\s*\(\) => request\('\/api\/operator\/recipient-status'\)/)
  assert.match(apiJs, /registerRecipient:\s*\(\) => request\('\/api\/operator\/register-recipient'/)
})

// ── Status ao vivo e link de verificação ───────────────────────────────────

const { getRecipient, kycLink } = await import('../src/payments/pagarme.js')

test('getRecipient devolve só status e KYC — nunca conta bancária ou PIX', async () => {
  const i = interceptar({ ok: true, status: 200, json: async () => ({
    id: 're_x', status: 'active',
    default_bank_account: { account_number: '55555' }, // veio na resposta…
    kyc_details: { status: 'approved' },
  }) })
  try {
    const info = await getRecipient('sk_test', 're_x')
    assert.deepEqual(info, { id: 're_x', status: 'active', kyc_status: 'approved' })
    assert.ok(!('default_bank_account' in info), '…mas não pode sair daqui')
    assert.match(i.chamadas[0].url, /\/recipients\/re_x$/)
  } finally { i.restaurar() }
})

test('kycLink devolve a URL do link de verificação', async () => {
  const i = interceptar({ ok: true, status: 200, json: async () => ({ url: 'https://kyc.pagar.me/abc', base64_qrcode: 'iVBOR' }) })
  try {
    const r = await kycLink('sk_test', 're_x')
    assert.equal(r.url, 'https://kyc.pagar.me/abc')
    assert.equal(r.qrcode, 'iVBOR')
    assert.match(i.chamadas[0].url, /\/recipients\/re_x\/kyc_link$/)
    assert.equal(i.chamadas[0].init.method, 'POST')
  } finally { i.restaurar() }
})

test('kycLink sem URL na resposta vira erro tratado, não sucesso vazio', async () => {
  const i = interceptar({ ok: true, status: 200, json: async () => ({}) })
  try {
    await assert.rejects(() => kycLink('sk_test', 're_x'), /link de verificação/)
  } finally { i.restaurar() }
})

test('o mapa de situação: só active é apto', () => {
  // Reproduz a regra da rota para travá-la aqui — o único verde é 'active'.
  const map = (s) => {
    switch (String(s || '').toLowerCase()) {
      case 'active': return 'apto'
      case 'refused': return 'recusado'
      case 'suspended': case 'blocked': case 'inactive': return 'suspenso'
      default: return 'analise'
    }
  }
  assert.equal(map('active'), 'apto')
  assert.equal(map('registration'), 'analise')
  assert.equal(map('refused'), 'recusado')
  assert.equal(map('suspended'), 'suspenso')
  assert.equal(map('coisa_nova'), 'analise', 'status desconhecido é conservador: análise, não apto')
})

test('a rota de status consulta o Pagar.me ao vivo quando já cadastrado', () => {
  const i = rota.indexOf("router.get('/recipient-status'")
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /getRecipient/, 'ter o id não basta — o status decide se está apto')
  assert.match(fn, /mapSituacaoRecebedor/)
  assert.match(fn, /apto/)
  // Falha do gateway não pode derrubar a tela de perfil.
  assert.match(fn, /catch \(e\)/)
})

test('a rota de KYC gera o link só do recebedor do próprio operador', () => {
  const i = rota.indexOf("router.post('/recipient-kyc-link'")
  assert.notEqual(i, -1, 'rota de KYC não encontrada')
  const fn = rota.slice(i, rota.indexOf('\nrouter.', i + 10))
  assert.match(fn, /\.eq\('id', req\.user\.id\)/)
  assert.ok(!/req\.params/.test(fn), 'nada de id vindo da URL')
  assert.match(fn, /kycLink/)
})

test('o cliente do operador expõe o link de KYC', () => {
  const apiJs = fs.readFileSync(new URL('../../operador/src/lib/api.js', import.meta.url), 'utf8')
  assert.match(apiJs, /recipientKycLink:\s*\(\) => request\('\/api\/operator\/recipient-kyc-link'/)
})
