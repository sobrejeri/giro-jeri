// Detalhe do passeio no celular: a folha que abre ao tocar num cartão da
// Lojinha (TourSheet) no visual novo. Junto, a dificuldade deixa de aparecer
// crua ("easy") e usa a mesma regra do cartão (lib/dificuldade.js). O PC não
// muda (a folha é só do celular e o CSS fica no @media; /passeios no PC
// conferido pixel a pixel).

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const tours = ler('../../turista/src/pages/Tours.jsx')
const cartao = ler('../../turista/src/components/tours/TourCard.jsx')
const regra = ler('../../turista/src/lib/dificuldade.js')
const css = ler('../../turista/src/pages/ToursVisual2026.css')
const folha = tours.slice(tours.indexOf('function TourSheet('), tours.indexOf('function DatePickerSheet('))

test('dificuldade: uma regra só, usada pelo cartão e pela folha', () => {
  assert.match(regra, /export function dificuldade\(nivel, t\)/)
  assert.match(cartao, /import \{ dificuldade \} from '\.\.\/\.\.\/lib\/dificuldade'/)
  assert.doesNotMatch(cartao, /function dificuldade\(/, 'sem cópia local no cartão')
  assert.match(tours, /import \{ dificuldade \} from '\.\.\/lib\/dificuldade'/)
  assert.match(folha, /const dif = dificuldade\(tour\.difficulty_level, t\)/)
  assert.doesNotMatch(folha, /\{tour\.difficulty_level\}/, 'a folha não mostra mais o texto cru ("easy")')
})

test('a folha só ganha o visual novo quando a Lojinha está nele', () => {
  assert.match(folha, /function TourSheet\(\{[^}]*visual2026 = false \}\)/)
  assert.match(folha, /className=\{`\$\{visual2026 \? 't2026-tour-sheet ' : ''\}fixed bottom-0/)
  assert.match(tours, /<TourSheet\s+visual2026=\{visual2026\}/)
  for (const c of ['t2026-tour-cover ', 't2026-tour-title ', 't2026-tour-meta ', 't2026-tour-desc ', 't2026-tour-roteiro', 't2026-tour-inc ', 't2026-tour-exc ', 't2026-tour-people ', 't2026-tour-footer ', 't2026-tour-add ']) {
    assert.ok(folha.includes(c), `${c.trim()} na folha`)
  }
})

test('pastilhas, roteiro num cartão só e botões no degradê da Lojinha', () => {
  assert.match(css, /\.t2026-tour-sheet\.fixed \{\s*border-top-left-radius: 28px;/)
  assert.match(css, /\.t2026-tour-sheet \.t2026-tour-meta > span \{[^}]*border-radius: 999px;/)
  assert.match(css, /\.t2026-tour-sheet \.t2026-tour-roteiro \{[^}]*border-radius: 18px;/)
  assert.match(css, /\.t2026-tour-sheet \.t2026-tour-roteiro > \* \+ \* \{[^}]*border-top: 1px dashed/)
  assert.match(css, /\.t2026-tour-sheet \.t2026-tour-people > button:last-child,\s*\.t2026-tour-sheet \.t2026-tour-add \{[^}]*linear-gradient\(112deg,#ff8e11,#fb5600\)/)
})

test('a foto mantém a altura: o seletor de pessoas continua visível sem rolar', () => {
  const capa = css.slice(css.indexOf('.t2026-tour-sheet .t2026-tour-cover {'))
  assert.doesNotMatch(capa.slice(0, capa.indexOf('}')), /height:/)
})

test('tudo isso vale só no celular (o PC continua igual)', () => {
  const inicioMedia = css.indexOf('@media (max-width: 1023px)')
  assert.notEqual(inicioMedia, -1)
  assert.ok(css.indexOf('.t2026-tour-sheet') > inicioMedia)
})
