// Minhas reservas no visual novo da Lojinha, só no celular (aprovado pelo dono
// em 12/11/2026). O PC não muda: as regras ficam no @media do CSS.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const reservas = ler('../../turista/src/pages/Bookings.jsx')
const css = ler('../../turista/src/pages/ToursVisual2026.css')

test('Reservas usa o escopo do visual novo e importa o CSS dele', () => {
  assert.match(reservas, /className="min-h-full pb-4 turiva-tours-visual2026 t2026-bookings"/)
  assert.match(reservas, /from 'date-fns\/locale'\nimport '\.\/ToursVisual2026\.css'/, 'import fora de qualquer import { … } de várias linhas')
})

test('cabeçalho laranja, abas num cartão sobreposto e cards no padrão', () => {
  assert.match(reservas, /<header className="t2026-bookings-header /)
  assert.match(reservas, /<div className="t2026-bookings-tabs flex overflow-x-auto"/)
  assert.match(reservas, /<div className="t2026-bookings-list /)
  assert.match(css, /\.t2026-bookings-header \{\s*position: relative;\s*top: auto;/, 'no celular rola com a página')
  assert.match(css, /\.t2026-bookings-tabs > button\.text-brand \{[^}]*linear-gradient\(112deg,#ff8e11,#fb5600\)/, 'aba ativa como na Lojinha')
  assert.match(css, /\.t2026-bookings-tabs > button > span\.absolute \{\s*display: none;/, 'sem o sublinhado antigo')
  assert.match(css, /\.t2026-bookings-list > \* \{[^}]*border-radius: 22px;/)
})

test('as 4 abas cabem num iPhone pequeno (fonte e espaços enxutos)', () => {
  assert.match(css, /\.t2026-bookings-tabs > button \{[^}]*font-size: 11\.5px;/)
  assert.match(css, /\.t2026-bookings-tabs > button > span:not\(\.absolute\) \{[^}]*margin-left: 3px;/)
})

test('tudo isso vale só no celular (o PC continua igual)', () => {
  const inicioMedia = css.indexOf('@media (max-width: 1023px)')
  for (const c of ['.t2026-bookings-header', '.t2026-bookings-tabs', '.t2026-bookings-list']) {
    assert.ok(css.indexOf(c) > inicioMedia, `${c} dentro do @media de celular`)
  }
})
