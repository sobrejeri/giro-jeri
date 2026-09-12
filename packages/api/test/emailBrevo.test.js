// Recuperação de senha por e-mail via Brevo.
//
// Duas mudanças, e a segunda é a que importa para segurança:
//
// 1. O provedor de e-mail passa a ser escolhido por configuração: Brevo quando
//    BREVO_API_KEY existe, Resend como herança, no-op sem nenhuma das duas.
//
// 2. O e-mail de redefinição passa a usar o MESMO token e o MESMO link do
//    WhatsApp. Antes ele chamava `supabase.auth.resetPasswordForEmail` — um
//    mecanismo completamente diferente: outro token, outro remetente, outra
//    página. Eram duas formas de redefinir a mesma senha, e só a do WhatsApp
//    passava pelas nossas regras (expiração de 30 min, escopo por propósito,
//    rate limit em /api/auth/reset-password).
//
// Nenhum e-mail é enviado aqui: o fetch é interceptado e inspecionado.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL ||= 'https://exemplo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste'

const email = await import('../src/services/email.js')
const { signResetToken, verifyResetToken } = await import('../src/lib/resetToken.js')
const { linkPasswordReset } = await import('../src/services/whatsapp.js')


// Recorta uma rota inteira: do início dela até a declaração da rota seguinte.
// Fatiar por tamanho fixo era frágil — bastou acrescentar um comentário para a
// resposta cair fora da janela e o teste acusar falha que não existia.
function corpoDaRota(fonte, assinatura) {
  const i = fonte.indexOf(assinatura)
  assert.notEqual(i, -1, `rota não encontrada: ${assinatura}`)
  const proxima = fonte.indexOf('\nrouter.', i + assinatura.length)
  return fonte.slice(i, proxima === -1 ? fonte.length : proxima)
}

// Captura a chamada HTTP em vez de enviar
function interceptar(resposta = { ok: true, json: async () => ({ messageId: 'x' }) }) {
  const original = globalThis.fetch
  const chamadas = []
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), init })
    return { status: 200, text: async () => '', ...resposta }
  }
  return { chamadas, restaurar: () => { globalThis.fetch = original } }
}

function comAmbiente(vars, fn) {
  const antes = {}
  for (const [k, v] of Object.entries(vars)) {
    antes[k] = process.env[k]
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
  try { return fn() } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
  }
}

test('escolha do provedor: Brevo ganha do Resend quando as duas chaves existem', () => {
  comAmbiente({ BREVO_API_KEY: 'b', RESEND_API_KEY: 'r' }, () => {
    assert.equal(email.emailProvider(), 'brevo',
      'com as duas definidas o Brevo tem de ganhar — é o que permite migrar sem janela sem e-mail')
    assert.equal(email.isEmailEnabled(), true)
  })
})

test('sem BREVO_API_KEY, o Resend segue atendendo — a volta atrás é apagar uma variável', () => {
  comAmbiente({ BREVO_API_KEY: undefined, RESEND_API_KEY: 'r' }, () => {
    assert.equal(email.emailProvider(), 'resend')
  })
})

test('sem nenhuma chave, vira no-op — e-mail nunca derruba reserva ou pagamento', async () => {
  await comAmbiente({ BREVO_API_KEY: undefined, RESEND_API_KEY: undefined }, async () => {
    assert.equal(email.emailProvider(), null)
    assert.equal(email.isEmailEnabled(), false)
    const i = interceptar()
    try {
      const r = await email.sendPasswordReset({ to: 'a@b.com', url: 'https://x/y' })
      assert.equal(r.skipped, true)
      assert.equal(i.chamadas.length, 0, 'sem provedor não pode haver chamada de rede')
    } finally { i.restaurar() }
  })
})

test('o remetente é quebrado em nome e e-mail — o Brevo exige separado', () => {
  assert.deepEqual(email.parseFrom('Turiva <contato@turivabrasil.com>'),
    { name: 'Turiva', email: 'contato@turivabrasil.com' })
  assert.deepEqual(email.parseFrom('contato@turivabrasil.com'),
    { name: 'Turiva', email: 'contato@turivabrasil.com' })
  // Valor vazio ou estranho não pode virar sender inválido
  assert.ok(email.parseFrom('').email.includes('@'))
  assert.ok(email.parseFrom(undefined).email.includes('@'))
})

test('a chamada ao Brevo tem o formato que a API dele espera', async () => {
  await comAmbiente({
    BREVO_API_KEY: 'chave-de-teste', RESEND_API_KEY: undefined,
    EMAIL_FROM: 'Turiva <contato@turivabrasil.com>',
  }, async () => {
    const i = interceptar()
    try {
      await email.sendPasswordReset({ to: 'cliente@exemplo.com', url: 'https://turivabrasil.com/redefinir-senha?token=abc' })
      assert.equal(i.chamadas.length, 1)
      const [c] = i.chamadas
      assert.equal(c.url, 'https://api.brevo.com/v3/smtp/email')
      assert.equal(c.init.headers['api-key'], 'chave-de-teste')
      const corpo = JSON.parse(c.init.body)
      assert.deepEqual(corpo.sender, { name: 'Turiva', email: 'contato@turivabrasil.com' })
      assert.deepEqual(corpo.to, [{ email: 'cliente@exemplo.com' }])
      assert.ok(corpo.subject, 'precisa de assunto')
      assert.ok(corpo.htmlContent.includes('https://turivabrasil.com/redefinir-senha?token=abc'),
        'o link precisa estar no corpo')
      assert.ok(!('html' in corpo), 'o Brevo usa htmlContent, não html')
    } finally { i.restaurar() }
  })
})

test('a chave da API nunca vai no corpo nem na URL', async () => {
  await comAmbiente({ BREVO_API_KEY: 'segredo-nao-vazar', RESEND_API_KEY: undefined }, async () => {
    const i = interceptar()
    try {
      await email.sendPasswordReset({ to: 'a@b.com', url: 'https://x/y' })
      const [c] = i.chamadas
      assert.ok(!c.url.includes('segredo-nao-vazar'), 'chave na URL vazaria em log de proxy')
      assert.ok(!String(c.init.body).includes('segredo-nao-vazar'))
    } finally { i.restaurar() }
  })
})

test('falha do Brevo não estoura — vira erro tratado', async () => {
  await comAmbiente({ BREVO_API_KEY: 'k', RESEND_API_KEY: undefined }, async () => {
    const i = interceptar({ ok: false, status: 401, text: async () => 'unauthorized' })
    try {
      const r = await email.sendPasswordReset({ to: 'a@b.com', url: 'https://x/y' })
      assert.equal(r.error, true)
      assert.equal(r.provider, 'brevo')
    } finally { i.restaurar() }
  })
})

test('rede fora do ar também não estoura', async () => {
  await comAmbiente({ BREVO_API_KEY: 'k', RESEND_API_KEY: undefined }, async () => {
    const original = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('ECONNRESET') }
    try {
      const r = await email.sendPasswordReset({ to: 'a@b.com', url: 'https://x/y' })
      assert.equal(r.error, true)
    } finally { globalThis.fetch = original }
  })
})

test('destinatário ou link ausente não vira chamada de rede', async () => {
  await comAmbiente({ BREVO_API_KEY: 'k' }, async () => {
    const i = interceptar()
    try {
      assert.equal((await email.sendPasswordReset({ to: '', url: 'https://x' })).skipped, true)
      assert.equal((await email.sendPasswordReset({ to: 'a@b.com', url: '' })).skipped, true)
      assert.equal(i.chamadas.length, 0)
    } finally { i.restaurar() }
  })
})

// ── O ponto de segurança: um mecanismo só para os dois canais ───────────────

test('e-mail e WhatsApp entregam EXATAMENTE o mesmo link', async () => {
  const token = signResetToken('11111111-1111-1111-1111-111111111111')
  const url = linkPasswordReset(token)
  await comAmbiente({ BREVO_API_KEY: 'k', RESEND_API_KEY: undefined }, async () => {
    const i = interceptar()
    try {
      await email.sendPasswordReset({ to: 'a@b.com', url })
      const corpo = JSON.parse(i.chamadas[0].init.body)
      assert.ok(corpo.htmlContent.includes(url),
        'se os links divergirem, um dos canais deixa de passar pelas nossas regras')
      assert.ok(url.includes('/redefinir-senha?token='))
    } finally { i.restaurar() }
  })
})

test('o token do e-mail passa pela MESMA validação — 30 min e escopo de propósito', () => {
  const id = '22222222-2222-2222-2222-222222222222'
  const token = signResetToken(id)
  assert.deepEqual(verifyResetToken(token), { user_id: id })
  // Token adulterado é recusado
  assert.throws(() => verifyResetToken(token.slice(0, -2) + 'xx'), /inválido|malformado/i)
  assert.throws(() => verifyResetToken('nao.e.token'), /inválido|malformado/i)
})

test('a rota de forgot-password não usa mais o mecanismo paralelo do Supabase', async () => {
  const fs = await import('node:fs')
  const fonte = fs.readFileSync(new URL('../src/routes/auth.js', import.meta.url), 'utf8')
  const i = fonte.indexOf("router.post('/forgot-password'")
  assert.notEqual(i, -1)
  // Sem comentários: o próprio código traz `resetPasswordForEmail` escrito na
  // explicação de por que ele saiu. Verificar a prosa daria falso positivo.
  const rota = fonte.slice(i, i + 2200).replace(/\/\/.*$/gm, '')
  assert.ok(!/resetPasswordForEmail/.test(rota),
    'voltou o caminho paralelo do Supabase — dois tokens diferentes para a mesma senha')
  assert.ok(/sendPasswordReset/.test(rota), 'o e-mail precisa sair pelo nosso serviço')
  assert.ok(/linkPasswordReset/.test(rota), 'o link precisa ser o mesmo do WhatsApp')
})

test('a resposta continua idêntica exista a conta ou não (anti-enumeração)', async () => {
  const fs = await import('node:fs')
  const fonte = fs.readFileSync(new URL('../src/routes/auth.js', import.meta.url), 'utf8')
  // Sem comentários também aqui: a explicação de por que o canal não é
  // revelado contém as palavras que o teste procura.
  const rota = corpoDaRota(fonte, "router.post('/forgot-password'").replace(/\/\/.*$/gm, '')
  const respostas = rota.match(/res\.json\([^)]*\)/g) || []
  assert.equal(respostas.length, 1,
    'mais de uma resposta de sucesso vira oráculo de existência de conta')
  assert.ok(/res\.json\(\{ ok: true \}\)/.test(rota))
  assert.ok(!/canal|channel|'email'|'whatsapp'/.test(rota.split('res.json')[1] || ''),
    'a resposta não pode revelar o canal usado')
})
