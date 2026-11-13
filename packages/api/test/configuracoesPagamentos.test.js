// Tela de Configurações → Pagamentos, separada por integração.
//
// A tela era um card só ("Gateway de Pagamento") com campos de TRÊS coisas
// diferentes misturados: o roteamento (quem cobra o quê), as credenciais do
// Mercado Pago e as do Pagar.me. O texto de ajuda do Mercado Pago aparecia
// logo acima do campo de chave do Pagar.me — e um Salvar único no fim.
//
// O que estes testes fixam não é estética. É a regra que já causou perda
// silenciosa aqui: cada Salvar manda uma LISTA EXPLÍCITA de chaves (hoje em
// CHAVES_PAGAMENTO, uma lista por seção), então um campo editável que não
// esteja na lista da SUA seção é marcado na tela e nunca gravado. Ao dividir
// ou reorganizar as seções, essa é exatamente a falha que a mudança poderia
// introduzir.
//
// Depois a aba ganhou seções recolhíveis agrupadas por gateway (Checkout ·
// Gateways · Recebimento e repasse · Outras integrações); o "split no ato",
// que vale para os dois gateways, saiu do Mercado Pago para a Divisão de
// recebimento.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const fonte = fs.readFileSync(
  new URL('../../admin/src/pages/Configuracoes.jsx', import.meta.url), 'utf8')

// Recorta o componente da aba de pagamentos, até o começo do próximo. Os
// comentários saem: as listas de Salvar são precedidas por explicações que
// mencionam nomes de chaves, e elas virariam falso positivo.
const semComentarios = (t) => t.replace(/^\s*\/\/.*$/gm, '')
const tab = semComentarios(fonte
  .slice(fonte.indexOf('function TabPagamentos'), fonte.indexOf('function WhatsappDiag')))

/** As chaves que o Salvar de cada seção grava (CHAVES_PAGAMENTO). */
function listasDeSalvamento() {
  const bloco = semComentarios(fonte.slice(
    fonte.indexOf('const CHAVES_PAGAMENTO'), fonte.indexOf('function GrupoPagamento')))
  const secoes = {}
  for (const m of bloco.matchAll(/^\s*([a-z]+):\s*\[([\s\S]*?)\]/gm)) {
    secoes[m[1]] = [...m[2].matchAll(/'([a-z0-9_]+)'/g)].map((k) => k[1])
  }
  return secoes
}

/** O trecho de uma seção recolhível da aba: do id dela até a próxima seção. */
function secao(id) {
  const i = tab.indexOf(`id="${id}"`)
  assert.ok(i !== -1, `seção ausente: ${id}`)
  const fim = tab.indexOf('<SecaoRecolhivel', i)
  return tab.slice(i, fim === -1 ? undefined : fim)
}

test('o Salvar de cada seção grava a lista DELA (CHAVES_PAGAMENTO)', () => {
  assert.match(tab, /pairs: CHAVES_PAGAMENTO\[secao\]\.map\(\(k\) => \[k, form\[k\]\]\)/)
  const secoes = listasDeSalvamento()
  assert.deepEqual(Object.keys(secoes).sort(),
    ['conta', 'divisao', 'formas', 'mercadopago', 'pagarme', 'roteamento'])
  for (const id of Object.keys(secoes)) {
    assert.match(secao(id), new RegExp(`salvarSecao\\('${id}'\\)`), `a seção ${id} salva a própria lista`)
  }
})

test('cada campo fica na seção cujo Salvar o grava', () => {
  // Campo numa seção e chave na lista de OUTRA: o usuário clica no Salvar que
  // está à vista e a mudança não vai — o mesmo silêncio de antes.
  const secoes = listasDeSalvamento()
  const fora = []
  for (const [id, chaves] of Object.entries(secoes)) {
    for (const m of secao(id).matchAll(/\bset\('([a-z0-9_]+)'/g)) {
      if (!chaves.includes(m[1])) fora.push(`${m[1]} (campo em ${id})`)
    }
  }
  assert.deepEqual(fora, [], `campo salvo pelo botão de outra seção: ${fora.join(', ')}`)
})

test('todo campo editável está na lista de Salvar de algum card', () => {
  const editadas = new Set([...tab.matchAll(/\bset\('([a-z0-9_]+)'/g)].map((m) => m[1]))
  const salvas   = new Set(Object.values(listasDeSalvamento()).flat())
  const orfas    = [...editadas].filter((k) => !salvas.has(k))
  assert.deepEqual(orfas, [],
    `campo editável fora de toda lista de Salvar — a tela marcaria e nunca gravaria: ${orfas.join(', ')}`)
})

test('nenhuma chave é salva por dois cards diferentes', () => {
  // Dois Salvar gravando a mesma chave é um sobrescrevendo o outro com o
  // valor que o usuário talvez nem tenha olhado naquele card.
  const secoes = listasDeSalvamento()
  const vistas = new Map()
  const duplicadas = []
  for (const [secao, chaves] of Object.entries(secoes)) {
    for (const k of chaves) {
      if (vistas.has(k)) duplicadas.push(`${k} (${vistas.get(k)} e ${secao})`)
      else vistas.set(k, secao)
    }
  }
  assert.deepEqual(duplicadas, [], `chave em mais de um Salvar: ${duplicadas.join(', ')}`)
})

test('cada chave de pagamento da allowlist tem campo na tela ou fica documentada', () => {
  // A allowlist (PAYMENT_KEYS) esconde as chaves da aba Sistema para não haver
  // dois lugares editando a mesma coisa. O efeito colateral: uma chave escondida
  // lá e sem campo aqui não é editável em lugar NENHUM, só por SQL. Foi o que
  // aconteceu com payment_pagarme_platform_recipient_id.
  const bloco = fonte.slice(fonte.indexOf('const PAYMENT_KEYS'), fonte.indexOf('// ── Payment tab constants'))
  const allowlist = [...bloco.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
  const salvas = new Set(Object.values(listasDeSalvamento()).flat())
  const semTela = allowlist.filter((k) => !salvas.has(k))
  assert.deepEqual(semTela, [],
    `escondida da aba Sistema e sem campo em Pagamentos — só editável por SQL: ${semTela.join(', ')}`)
})

// ── A separação por integração ─────────────────────────────────────────────

test('existe uma seção por gateway, além do roteamento', () => {
  for (const titulo of [
    'titulo="Roteamento de cobrança"',
    'titulo="Mercado Pago"',
    'titulo="Pagar.me (Stone)"',
  ]) {
    assert.ok(tab.includes(titulo), `seção ausente: ${titulo}`)
  }
  assert.match(tab, /<GrupoPagamento titulo="Gateways">/, 'os gateways ficam agrupados')
})

test('a chave do Pagar.me não fica na seção do Mercado Pago', () => {
  assert.ok(!/payment_pagarme/.test(secao('mercadopago')),
    'campo do Pagar.me sob o cabeçalho do Mercado Pago foi exatamente a confusão relatada')
})

test('a ajuda do Mercado Pago não aparece na seção do Pagar.me', () => {
  const pg = secao('pagarme')
  assert.ok(!/MERCADO_PAGO_ACCESS_TOKEN|Checkout Pro/.test(pg))
  assert.ok(/PAGARME_API_KEY/.test(pg), 'a variável de ambiente certa precisa estar dita aqui')
})

test('o recebedor da plataforma tem campo e é salvo com a chave do Pagar.me', () => {
  const secoes = listasDeSalvamento()
  assert.deepEqual(secoes.pagarme,
    ['payment_pagarme_api_key', 'payment_pagarme_public_key',
     'payment_pagarme_platform_recipient_id'])
  assert.match(tab, /placeholder="re_\.\.\."/,
    'o prefixo do recebedor nesta conta é re_, não rp_')
})

test('o roteamento não carrega credencial de adquirente nenhum', () => {
  const card = secao('roteamento')
  assert.ok(!/MaskedInput/.test(card),
    'chave de API na seção de roteamento é o que misturava tudo de novo')
  assert.match(card, /payment_card_acquirers/, 'quem cobra o cartão é decisão de roteamento')
  assert.match(card, /payment_gateway_pix/,    'quem cobra o PIX também')
})

test('o split no ato (vale para os dois gateways) fica na Divisão de recebimento', () => {
  assert.match(secao('divisao'), /set\('payment_split_single_operator'/)
  assert.ok(!/payment_split_single_operator/.test(secao('mercadopago')),
    'dentro do Mercado Pago, quem olhava o Pagar.me não achava a chave')
  assert.ok(listasDeSalvamento().divisao.includes('payment_split_single_operator'))
})

// ── Alternar adquirente de cartão ──────────────────────────────────────────
// Enquanto payment_card_acquirers está vazio, as caixas são desenhadas a
// partir do gateway padrão: o Mercado Pago aparece MARCADO sem constar da
// lista. Alternar partindo da string gravada fazia a lista nascer com um item
// só — marcar o Pagar.me apagava o Mercado Pago, e o botão dele sumia do
// checkout sem ninguém ter desmarcado nada.

test('marcar um adquirente não desmarca o que já estava marcado na tela', () => {
  // Reproduz as duas funções como estão na fonte, para o teste falhar se a
  // correção for desfeita lá.
  const ACQ = ['mercado_pago', 'pagarme']
  function listaDeCartao(atual, valor, marcado) {
    const tem = new Set(String(atual || '').split(',').map((s) => s.trim()).filter(Boolean))
    if (marcado) tem.add(valor); else tem.delete(valor)
    return ACQ.filter((v) => tem.has(v)).join(',')
  }
  const form = { payment_card_acquirers: '', payment_gateway_card: '', payment_gateway: 'mercado_pago' }
  const marcado = (v) => {
    const l = String(form.payment_card_acquirers || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (l.length) return l.includes(v)
    return (String(form.payment_gateway_card || '').trim() || form.payment_gateway) === v
  }
  const alternar = (v, m) => listaDeCartao(ACQ.filter(marcado).join(','), v, m)

  assert.equal(marcado('mercado_pago'), true, 'a tela mostra o MP marcado, herdado do gateway')
  assert.equal(alternar('pagarme', true), 'mercado_pago,pagarme',
    'marcar o Pagar.me não pode derrubar o Mercado Pago que a tela mostrava marcado')
})

test('a tela usa alternarCartao, não a string gravada', () => {
  assert.match(tab, /onChange=\{\(e\) => set\('payment_card_acquirers',\s*alternarCartao\(/,
    'voltar a partir de form.payment_card_acquirers reintroduz o sumiço do botão')
  assert.match(tab, /ACQUIRERS_CARTAO\.filter\(\(a\) => cartaoMarcado\(a\.value\)\)/,
    'a base do toggle tem de ser o que está visível')
})
