// Tela de carrinho (turista): melhorias visuais pedidas a partir do modelo de
// referência — cabeçalho da marca, "Reservando com <operador>", resumo com
// definido × pendente, e os campos que faltam viram chips de ação.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(
  new URL('../../turista/src/pages/CartPage.jsx', import.meta.url), 'utf8')

test('tem cabeçalho da marca com logo e assinatura', () => {
  assert.match(src, /function CartHeader/)
  assert.match(src, /Viagens que ficam/)
  assert.match(src, /logo-icon\.jpeg/)
  assert.ok(!/import PageHeader/.test(src), 'o header genérico foi substituído pelo da marca')
})

test('mostra "Reservando com <operador>" na venda direta', () => {
  assert.match(src, /Reservando com/)
  assert.match(src, /getPartnerAttribution\(\)\?\.name/, 'usa o nome do operador do link')
})

test('o resumo separa valor definido de pendente (a calcular)', () => {
  assert.match(src, /const definedCount =/)
  assert.match(src, /const pendingCount =/)
  assert.match(src, /A calcular/)
  assert.match(src, /Subtotal parcial/, 'com item pendente, o total é parcial')
})

test('campos que faltam viram chips de ação', () => {
  assert.match(src, /function missingChips/)
  assert.match(src, /Escolher data/)
  assert.match(src, /Selecionar veículo/)
  assert.match(src, /missingChips\(miss\)\.map/)
})
