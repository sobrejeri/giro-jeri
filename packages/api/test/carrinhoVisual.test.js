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
  assert.match(src, /a calcular/i)
  assert.match(src, /Subtotal parcial/, 'com item pendente, o total é parcial')
})

test('campos que faltam viram chips de ação', () => {
  assert.match(src, /function missingChips/)
  assert.match(src, /Escolher data/)
  assert.match(src, /Selecionar veículo/)
  assert.match(src, /missingChips\(miss\)\.map/)
})

test('o menu inferior some no carrinho para liberar espaço', () => {
  const nav = fs.readFileSync(
    new URL('../../turista/src/components/layout/BottomNav.jsx', import.meta.url), 'utf8')
  assert.match(nav, /pathname === '\/carrinho'\) return null/,
    'sem o menu, a barra de resumo cola embaixo')
})

test('o resumo flutuante cola embaixo (menu escondido) e é mais compacto', () => {
  // bottom-0 no mobile (antes era bottom-[64px] para desviar do menu).
  assert.match(src, /fixed bottom-0 left-1\/2/, 'o resumo desce para a base agora que o menu saiu')
  assert.ok(!/bottom-\[64px\]/.test(src), 'não deve mais reservar a faixa do menu')
})

test('o cupom fica atrás de "Tem cupom?" e abre sozinho se veio por link', () => {
  assert.match(src, /const \[showCoupon,\s*setShowCoupon\]/, 'o campo de cupom é colapsável')
  assert.match(src, /Tem cupom\?/, 'o gatilho ocupa só uma linha curta')
  assert.match(src, /setShowCoupon\(true\)/, 'cupom vindo do link já abre o campo')
  assert.ok(!/O total é atualizado ao completar os serviços/.test(src),
    'a nota ilustrativa longa foi removida para poupar altura')
})
