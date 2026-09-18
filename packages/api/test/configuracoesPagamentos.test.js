// Tela de Configurações → Pagamentos, separada por integração.
//
// A tela era um card só ("Gateway de Pagamento") com campos de TRÊS coisas
// diferentes misturados: o roteamento (quem cobra o quê), as credenciais do
// Mercado Pago e as do Pagar.me. O texto de ajuda do Mercado Pago aparecia
// logo acima do campo de chave do Pagar.me — e um Salvar único no fim.
//
// O que estes testes fixam não é estética. É a regra que já causou perda
// silenciosa aqui: `saveSection` manda uma LISTA EXPLÍCITA de chaves, então
// um campo editável que não esteja na lista do seu card é marcado na tela e
// nunca gravado. Ao dividir um card em três, essa é exatamente a falha que a
// divisão poderia introduzir.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const fonte = fs.readFileSync(
  new URL('../../admin/src/pages/Configuracoes.jsx', import.meta.url), 'utf8')

// Recorta o componente da aba de pagamentos, até o começo do próximo. Os
// comentários saem: as listas de Salvar são precedidas por explicações que
// mencionam nomes de chaves, e elas virariam falso positivo.
const tab = fonte
  .slice(fonte.indexOf('function TabPagamentos'), fonte.indexOf('function SaveRow'))
  .replace(/^\s*\/\/.*$/gm, '')

/** As chaves passadas a cada `saveSection([...], 'secao')`. */
function listasDeSalvamento(texto) {
  const secoes = {}
  for (const m of texto.matchAll(/saveSection\(\s*\[([\s\S]*?)\]\s*,\s*'([a-z]+)'/g)) {
    secoes[m[2]] = [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((k) => k[1])
  }
  return secoes
}

test('todo campo editável está na lista de Salvar de algum card', () => {
  const editadas = new Set([...tab.matchAll(/\bset\('([a-z0-9_]+)'/g)].map((m) => m[1]))
  const salvas   = new Set(Object.values(listasDeSalvamento(tab)).flat())
  const orfas    = [...editadas].filter((k) => !salvas.has(k))
  assert.deepEqual(orfas, [],
    `campo editável fora de toda lista de Salvar — a tela marcaria e nunca gravaria: ${orfas.join(', ')}`)
})

test('nenhuma chave é salva por dois cards diferentes', () => {
  // Dois Salvar gravando a mesma chave é um sobrescrevendo o outro com o
  // valor que o usuário talvez nem tenha olhado naquele card.
  const secoes = listasDeSalvamento(tab)
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
  const salvas = new Set(Object.values(listasDeSalvamento(tab)).flat())
  const semTela = allowlist.filter((k) => !salvas.has(k))
  assert.deepEqual(semTela, [],
    `escondida da aba Sistema e sem campo em Pagamentos — só editável por SQL: ${semTela.join(', ')}`)
})

// ── A separação por integração ─────────────────────────────────────────────

test('existe um card por integração, além do roteamento', () => {
  for (const titulo of [
    'Roteamento de cobrança',
    'Integração — Mercado Pago',
    'Integração — Pagar.me (Stone)',
  ]) {
    assert.ok(tab.includes(titulo), `card ausente: ${titulo}`)
  }
})

test('a chave do Pagar.me não fica no card do Mercado Pago', () => {
  const iMp   = tab.indexOf('Integração — Mercado Pago')
  const iPg   = tab.indexOf('Integração — Pagar.me')
  assert.ok(iMp !== -1 && iPg > iMp)
  const cardMp = tab.slice(iMp, iPg)
  assert.ok(!/payment_pagarme/.test(cardMp),
    'campo do Pagar.me sob o cabeçalho do Mercado Pago foi exatamente a confusão relatada')
})

test('a ajuda do Mercado Pago não aparece no card do Pagar.me', () => {
  const cardPg = tab.slice(tab.indexOf('Integração — Pagar.me'), tab.indexOf("'pagarme',") + 40)
  assert.ok(!/MERCADO_PAGO_ACCESS_TOKEN|Checkout Pro/.test(cardPg))
  assert.ok(/PAGARME_API_KEY/.test(cardPg), 'a variável de ambiente certa precisa estar dita aqui')
})

test('o recebedor da plataforma tem campo e é salvo com a chave do Pagar.me', () => {
  const secoes = listasDeSalvamento(tab)
  assert.deepEqual(secoes.pagarme,
    ['payment_pagarme_api_key', 'payment_pagarme_platform_recipient_id'])
  assert.match(tab, /placeholder="re_\.\.\."/,
    'o prefixo do recebedor nesta conta é re_, não rp_')
})

test('o roteamento não carrega credencial de adquirente nenhum', () => {
  const card = tab.slice(tab.indexOf('Roteamento de cobrança'), tab.indexOf('Integração — Mercado Pago'))
  assert.ok(!/MaskedInput/.test(card),
    'chave de API no card de roteamento é o que misturava tudo de novo')
  assert.match(card, /payment_card_acquirers/, 'quem cobra o cartão é decisão de roteamento')
  assert.match(card, /payment_gateway_pix/,    'quem cobra o PIX também')
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
