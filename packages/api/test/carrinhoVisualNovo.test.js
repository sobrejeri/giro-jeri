// Carrinho no visual novo da Lojinha, só no celular: cabeçalho laranja, o 1º
// item atravessa a borda dele, cards e botões no padrão da Lojinha. O PC não
// muda: as regras ficam no @media do CSS (conferido pixel a pixel, com itens e
// vazio).

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const carrinho = ler('../../turista/src/pages/CartPage.jsx')
const css = ler('../../turista/src/pages/ToursVisual2026.css')

test('Carrinho usa o escopo do visual novo e importa o CSS dele', () => {
  assert.match(carrinho, /<div className="min-h-screen turiva-tours-visual2026 t2026-cart" style=\{\{ paddingBottom: footerH \? footerH \+ 16 : 160 \}\}>/,
    'o paddingBottom medido (inline) continua valendo sobre o do CSS')
  assert.match(carrinho, /from '\.\.\/lib\/season'\nimport '\.\/ToursVisual2026\.css'/, 'import fora de qualquer import { … } de várias linhas')
  for (const c of ['t2026-cart-header ', 't2026-cart-count ', 't2026-cart-empty ', 't2026-cart-list ', 't2026-cart-item ', 't2026-cart-thumb ', 't2026-cart-suggest ', 't2026-cart-footer ']) {
    assert.ok(carrinho.includes(c), `${c.trim()} na tela`)
  }
  assert.equal((carrinho.match(/className="t2026-cart-cta /g) || []).length, 4,
    'degradê em: Ver passeios, Completar detalhes, Acompanhar pedidos e Solicitar tudo')
})

test('cabeçalho laranja e 1º item atravessando a borda', () => {
  assert.match(css, /\.t2026-cart-header \{[^}]*linear-gradient\(122deg,#e84303 0%,#ff6400 58%,#ff8d11 100%\)/, 'mesmo laranja da Lojinha')
  assert.match(css, /\.t2026-cart-header \.font-giro \{\s*color: white;/)
  assert.match(css, /\.t2026-cart-header > \.pointer-events-none \{\s*display: none;/, 'sem o brilho de areia antigo')
  assert.match(css, /\.t2026-cart-list \{[^}]*margin-top: -32px;/)
})

test('cards, botões e resumo no padrão da Lojinha', () => {
  assert.match(css, /\.t2026-cart-item \{[^}]*border-radius: 22px;/)
  assert.match(css, /\.t2026-cart-item\.border-gray-100 \{\s*border-color: #f0eeeb;/, 'mantém as bordas verde/vermelha de enviado/erro')
  assert.match(css, /\.turiva-tours-visual2026 \.t2026-cart-cta,\s*\.t2026-cart-footer \.t2026-cart-cta \{[^}]*linear-gradient\(112deg,#ff8e11,#fb5600\)/,
    'o resumo vai por portal para o body: também precisa do seletor pela classe dele')
  assert.match(css, /\.t2026-cart-footer > div \{[^}]*border-radius: 26px;/)
})

test('tudo isso vale só no celular (o PC continua igual)', () => {
  const inicioMedia = css.indexOf('@media (max-width: 1023px)')
  assert.notEqual(inicioMedia, -1)
  for (const c of ['.t2026-cart-header', '.t2026-cart-list', '.t2026-cart-item', '.t2026-cart-cta', '.t2026-cart-footer']) {
    assert.ok(css.indexOf(c) > inicioMedia, `${c} dentro do @media de celular`)
  }
})
