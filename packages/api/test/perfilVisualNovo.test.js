// Perfil no visual novo da Lojinha, só no celular (aprovado pelo dono em
// 12/11/2026). O PC não muda: as regras ficam no @media do CSS e a versão de
// PC é outro componente.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const perfil = ler('../../turista/src/pages/Profile.jsx')
const css = ler('../../turista/src/pages/ToursVisual2026.css')

test('Perfil usa o escopo do visual novo e importa o CSS dele', () => {
  assert.match(perfil, /<div className="lg:hidden min-h-full pb-4 turiva-tours-visual2026 t2026-profile">/)
  assert.match(perfil, /from '\.\.\/components\/ProfilePostsFeed'\nimport '\.\/ToursVisual2026\.css'/, 'import fora de qualquer import { … } de várias linhas')
})

test('o comentário dentro do fragmento é de JSX (um // apareceria como texto na tela)', () => {
  const inicio = perfil.indexOf('turiva-tours-visual2026 t2026-profile">')
  const linhaSeguinte = perfil.slice(inicio).split('\n')[1]
  assert.match(linhaSeguinte, /^\s*\{\/\*.*\*\/\}\s*$/)
})

test('cabeçalho laranja que rola com a página e 1º cartão sobre a borda dele', () => {
  assert.match(perfil, /<header className="t2026-profile-header /)
  assert.match(perfil, /<main className="t2026-profile-main /)
  assert.match(css, /\.t2026-profile-header \{\s*position: relative;\s*top: auto;/, 'no celular não fica preso no topo')
  assert.match(css, /\.t2026-profile-header \{[^}]*linear-gradient\(122deg,#e84303 0%,#ff6400 58%,#ff8d11 100%\)/, 'mesmo laranja da Lojinha')
  assert.match(css, /\.t2026-profile-header h1 \{[^}]*color: white;/)
  assert.match(css, /\.t2026-profile-main > :first-child \{[^}]*margin-top: -32px;/, 'atravessa a borda, como o "Saindo de"')
  assert.match(css, /\.t2026-profile-main > button \{[^}]*border-radius: 22px;/, 'cards no padrão da Lojinha')
})

test('cartão de pontos branco com o número em laranja', () => {
  for (const c of ['t2026-points ', 't2026-points-label ', 't2026-points-value ', 't2026-points-hint ', 't2026-points-gift ', 't2026-points-history ']) {
    assert.ok(perfil.includes(`className="${c}`), `${c.trim()} no PontosCard`)
  }
  assert.match(css, /\.t2026-points \{[^}]*background: white;/)
  assert.match(css, /\.t2026-points-value \{\s*color: #ff6200;/)
})

test('tudo isso vale só no celular (o PC continua igual)', () => {
  const inicioMedia = css.indexOf('@media (max-width: 1023px)')
  assert.notEqual(inicioMedia, -1)
  for (const c of ['.t2026-profile-header', '.t2026-profile-main', '.t2026-points']) {
    assert.ok(css.indexOf(c) > inicioMedia, `${c} dentro do @media de celular`)
  }
})
