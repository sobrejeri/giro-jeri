// O SERVIDOR é a fonte de verdade do valor cobrado.
//
// Falha encontrada na auditoria: `computeChargedTotal` recalculava o preço,
// mas TODO caminho que não conseguia calcular caía em `Number(total_price)` —
// o valor que veio do navegador. E `region_id` é opcional no schema enquanto o
// recálculo exige ele. Bastava omitir `region_id` para que nenhum cálculo
// rodasse e a cobrança saísse pelo valor escolhido pelo cliente (mínimo do
// schema: R$ 1,00), num passeio de qualquer preço.
//
// Estes testes fixam a regra: sem preço calculado pelo servidor, `autoritativo`
// é false — e quem chama recusa a cobrança em vez de aceitar o valor do
// cliente. Os caminhos legítimos continuam devolvendo autoritativo = true.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL ||= 'https://exemplo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste'

const { intentSchema } = await import('../src/routes/payments.js')
const fonte = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../src/routes/payments.js', import.meta.url), 'utf8'))

const UUID_A = '11111111-1111-1111-1111-111111111111'
const UUID_R = '33333333-3333-3333-3333-333333333333'

test('o schema ACEITA um pedido sem region_id — por isso a defesa não pode viver no schema', () => {
  const r = intentSchema.safeParse({
    service_type: 'tour', service_id: UUID_A,
    service_date_iso: '2026-12-01', total_price: 1, payment_method: 'pix',
  })
  assert.equal(r.success, true, 'se isto falhar, o schema mudou e o teste precisa mudar junto')
  assert.equal(r.data.region_id, undefined)
})

test('computeChargedTotal devolve autoritativo e NÃO cai mais no total do cliente', () => {
  // O bloco de exceção não pode reatribuir chargedTotal a partir de total_price.
  const catchBlock = fonte.slice(
    fonte.indexOf('recálculo de preço falhou'),
    fonte.indexOf('return { total: chargedTotal'),
  )
  assert.ok(!/chargedTotal\s*=\s*Number\(total_price\)/.test(catchBlock),
    'o catch voltou a usar o total do cliente como valor cobrado')
  assert.ok(/autoritativo\s*=\s*false/.test(catchBlock),
    'o catch precisa marcar o preço como não autoritativo')
  assert.ok(/autoritativo\b/.test(fonte.slice(fonte.indexOf('return { total: chargedTotal'),
    fonte.indexOf('return { total: chargedTotal') + 200)),
    'computeChargedTotal precisa devolver autoritativo')
})

test('os três chamadores recusam quando o preço não é autoritativo', () => {
  const recusas = fonte.match(/if \(!autoritativo\)|!calc\.autoritativo/g) || []
  assert.ok(recusas.length >= 3,
    `esperado ao menos 3 pontos de recusa, achei ${recusas.length}`)
  // A recusa não pode vazar detalhe interno para o cliente.
  const trechos = fonte.split('autoritativo').filter((t) => t.startsWith(')'))
  for (const t of trechos.slice(0, 3)) {
    const janela = t.slice(0, 600)
    assert.ok(!/constraint|supabase|postgres|stack/i.test(janela),
      'a resposta de recusa não pode citar detalhe interno')
  }
})

test('reserva existente e grupo usam o total do BANCO, nunca o do cliente', () => {
  // O valor inicial de chargedTotal não pode mais ser Number(total_price):
  // era o que deixava a leitura ambígua e um refactor podia tornar explorável.
  assert.ok(!/let chargedTotal = existing_booking_id\s*\n\s*\?\s*Number\(total_price\)/.test(fonte),
    'o caminho de reserva existente voltou a partir do total do cliente')
  assert.ok(/chargedTotal = Number\(existing\.total_amount\)/.test(fonte),
    'reserva existente precisa cobrar o total gravado no banco')
  assert.ok(/chargedTotal\s*=\s*payable\.reduce/.test(fonte),
    'grupo precisa somar os totais gravados no banco')
})

test('o valor mínimo do schema não é defesa de preço — só de formato', () => {
  // Documenta por que o mínimo de R$1 não salvava: ele apenas garantia que o
  // número era positivo, e o atacante escolhia exatamente esse mínimo.
  const r = intentSchema.safeParse({
    service_type: 'tour', service_id: UUID_A, region_id: UUID_R,
    service_date_iso: '2026-12-01', total_price: 1, payment_method: 'pix',
  })
  assert.equal(r.success, true)
  assert.equal(r.data.total_price, 1)
})
