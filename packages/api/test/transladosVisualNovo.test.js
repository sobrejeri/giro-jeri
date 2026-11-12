// Translados no visual novo da Lojinha (aprovado pelo dono em 12/11/2026).
//
// Translados é uma aba dentro da Lojinha (Passeios | Translados | Vagas): ao
// trocar de aba o cliente não pode "mudar de app". Asserções de fonte, como no
// resto da suíte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const transfers = ler('../../turista/src/pages/Transfers.jsx')
const css = ler('../../turista/src/pages/ToursVisual2026.css')

test('Translados (celular) usa o cabeçalho laranja, o cartão de cidade e as abas da Lojinha', () => {
  assert.match(transfers, /<div className="lg:hidden min-h-screen pb-16 turiva-tours-visual2026">/)
  assert.match(transfers, /<div className="t2026-header /)
  assert.match(transfers, /className="t2026-location [^"]*"/)
  assert.match(transfers, /onClick=\{openPicker\}/, 'o cartão troca a cidade, como a faixa antiga')
  assert.match(transfers, /<div className="t2026-tabs /)
  assert.match(transfers, /<div className="t2026-mode /)
  assert.match(transfers, /import '\.\/ToursVisual2026\.css'/)
})

test('a aba ativa é a da tela atual (não mais "a primeira")', () => {
  assert.match(css, /\.t2026-tabs > button\[aria-current="page"\]/)
  assert.doesNotMatch(css, /\.t2026-tabs > button:first-child/)
  const abas = transfers.split('t2026-tabs')[1].split('t2026-mode')[0]
  const atual = abas.match(/aria-current="page"[\s\S]*?<\/button>/)?.[0] ?? ''
  assert.match(atual, /Translados/, 'em Translados quem fica laranja é Translados')
})

test('o ícone do "Translado personalizado" não encolhe até virar um ponto', () => {
  assert.match(css, /\.t2026-mode > button svg \{\s*flex-shrink: 0;/)
})

test('rotas populares com as pastilhas da Lojinha', () => {
  assert.match(transfers, /<div className="t2026-routes">/)
  assert.match(transfers, /<FilterChip label="Todas" ativo=\{routeOrigin === ''\}/)
})

test('no celular a faixa "Saindo de" sai (o cartão a substitui); no PC continua', () => {
  const layout = ler('../../turista/src/components/layout/Layout.jsx')
  assert.match(layout, /\|\| pathname === '\/transfers'/)
  assert.match(layout, /lojinhaNova \? <div className="hidden lg:block"><RegionBar \/><\/div> : <RegionBar \/>/)
})

test('barra inferior: Lojinha acesa em Translados e Descubra em laranja, como na Lojinha', () => {
  const nav = ler('../../turista/src/components/layout/BottomNav.jsx')
  assert.match(nav, /label: 'Lojinha', tambem: \['\/transfers'\]/)
  assert.match(nav, /<Aba to="\/passeios" icon=\{Store\} label="Lojinha" tambem=\{\['\/transfers'\]\} \/>/)
  assert.match(nav, /tambem\.some\(\(p\) => pathname\.startsWith\(p\)\)/)
  assert.match(nav, /\|\| pathname === '\/transfers'\n/)
})
