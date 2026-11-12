// Descubra (feed) no visual novo da Lojinha, só no celular (aprovado pelo dono
// em 12/11/2026). O PC não muda: todas as regras ficam no @media do CSS.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const feed = ler('../../turista/src/pages/Feed.jsx')
const css = ler('../../turista/src/pages/ToursVisual2026.css')

test('a Descubra usa o escopo do visual novo e importa o CSS dele', () => {
  assert.match(feed, /className="min-h-full pb-4 lg:pb-10 bg-white turiva-tours-visual2026 t2026-feed"/)
  assert.match(feed, /\} from 'lucide-react'\nimport '\.\/ToursVisual2026\.css'/, 'import fora de qualquer import { … } de várias linhas')
})

test('cabeçalho laranja que rola com a página, stories em cartão, pastilhas e posts no padrão', () => {
  assert.match(feed, /<header className="t2026-feed-header /)
  assert.match(feed, /<LiveStoriesRow className="t2026-stories /)
  assert.match(feed, /<div className="t2026-feed-chips /)
  assert.match(feed, /<main className="t2026-feed-main /)
  assert.match(css, /\.t2026-feed-header \{\s*position: relative;\s*top: auto;/, 'no celular não fica preso no topo')
  assert.match(css, /\.t2026-stories \{[^}]*margin: -22px 16px 0;/, 'stories sobre o cabeçalho, como o cartão de cidade')
  assert.match(css, /\.t2026-feed-chips button\.bg-brand \{[^}]*border-color: #ff6a00;/, 'ativa com contorno, como na Lojinha')
  assert.match(css, /\.t2026-feed-main article \{[^}]*border-radius: 22px;/)
})

test('tudo isso vale só no celular (o PC continua igual)', () => {
  const inicioMedia = css.indexOf('@media (max-width: 1023px)')
  assert.notEqual(inicioMedia, -1)
  for (const c of ['.t2026-feed-header', '.t2026-stories', '.t2026-feed-chips', '.t2026-feed-main']) {
    assert.ok(css.indexOf(c) > inicioMedia, `${c} dentro do @media de celular`)
  }
})
