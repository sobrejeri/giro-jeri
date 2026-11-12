// Favoritos no visual novo da Lojinha, só no celular: cabeçalho laranja que
// rola com a página (com a contagem em branco) e a grade de passeios sobre a
// borda dele, nos cartões dos favoritos da Lojinha. O PC não muda: as regras
// ficam no @media do CSS (conferido pixel a pixel, com favoritos e vazio).

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const favoritos = ler('../../turista/src/pages/Favoritos.jsx')
const css = ler('../../turista/src/pages/ToursVisual2026.css')

test('Favoritos usa o escopo do visual novo e importa o CSS dele', () => {
  assert.match(favoritos, /<div className="min-h-screen pb-6 turiva-tours-visual2026 t2026-fav">/)
  assert.match(favoritos, /from '\.\.\/components\/tours\/TourCard'\nimport '\.\/ToursVisual2026\.css'/)
  for (const c of ['t2026-fav-header ', 't2026-fav-empty ', 't2026-fav-cta ', 't2026-fav-list ', 't2026-fav-count ', 't2026-fav-grid ']) {
    assert.ok(favoritos.includes(c), `${c.trim()} na tela`)
  }
})

test('a contagem vai para o cabeçalho só no celular (no PC continua acima da grade)', () => {
  assert.match(favoritos, /<p className="t2026-fav-sub hidden">/, 'escondida por padrão (PC)')
  assert.match(css, /\.turiva-tours-visual2026 \.t2026-fav-sub \{\s*display: block;/)
  assert.match(css, /\.turiva-tours-visual2026 \.t2026-fav-count \{\s*display: none;/)
})

test('cabeçalho laranja que rola e grade sobre a borda dele', () => {
  assert.match(css, /\.t2026-fav-header \{\s*position: relative;\s*top: auto;/, 'no celular não fica preso no topo')
  assert.match(css, /\.t2026-fav-header \{[^}]*linear-gradient\(122deg,#e84303 0%,#ff6400 58%,#ff8d11 100%\)/)
  assert.match(css, /\.t2026-fav-header h1 \{[^}]*color: white;/)
  assert.match(css, /\.t2026-fav-list \{[^}]*margin-top: -32px;/)
  assert.match(css, /\.t2026-fav-grid > \.snap-start \{[^}]*border-radius: 22px;/, 'mesmos cartões dos favoritos da Lojinha')
  assert.match(css, /\.t2026-fav-cta \{[^}]*linear-gradient\(112deg,#ff8e11,#fb5600\)/)
})

test('tudo isso vale só no celular (o PC continua igual)', () => {
  const inicioMedia = css.indexOf('@media (max-width: 1023px)')
  assert.notEqual(inicioMedia, -1)
  for (const c of ['.t2026-fav-header', '.t2026-fav-sub', '.t2026-fav-list', '.t2026-fav-grid', '.t2026-fav-cta']) {
    assert.ok(css.indexOf(c) > inicioMedia, `${c} dentro do @media de celular`)
  }
})
