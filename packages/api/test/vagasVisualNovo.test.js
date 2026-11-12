// Vagas (estacionamento) no visual novo da Lojinha (aprovado pelo dono em
// 12/11/2026). Vagas é a terceira aba da Lojinha (Passeios | Translados | Vagas):
// mesmo cabeçalho laranja, mesmo cartão de cidade e as mesmas abas.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const vagas = ler('../../turista/src/pages/Estacionamento.jsx')
const css = ler('../../turista/src/pages/ToursVisual2026.css')

test('Vagas (celular) ganha o cabeçalho laranja e o cartão de cidade da Lojinha', () => {
  assert.match(vagas, /<div className="lg:hidden min-h-screen pb-16 turiva-tours-visual2026">/)
  assert.match(vagas, /<div className="t2026-header /)
  assert.match(vagas, /className="t2026-location [^"]*"/)
  assert.match(vagas, /const \{ region, openPicker \} = useRegion\(\)/, 'agora dá para trocar a cidade aqui')
  assert.match(vagas, /onClick=\{openPicker\}/)
  assert.match(vagas, /import '\.\/ToursVisual2026\.css'/)
})

test('a aba ativa é Vagas', () => {
  const abas = vagas.split('t2026-tabs')[1].split('t2026-parking-banner')[0]
  const atual = abas.match(/<button className="[^"]*" aria-current="page">[\s\S]*?<\/button>/)?.[0] ?? ''
  assert.match(atual, /spotsCrumb/)
})

test('a lupa do cabeçalho leva até a busca da página (sem busca duplicada)', () => {
  assert.match(vagas, /const buscaRef = useRef\(null\)/)
  assert.match(vagas, /buscaRef\.current\?\.scrollIntoView\(/)
  assert.match(vagas, /<input\s+ref=\{buscaRef\}/)
})

test('banner, busca, título e cards no padrão do visual novo', () => {
  for (const c of ['t2026-parking-banner', 't2026-search', 't2026-section-title', 't2026-lots']) {
    assert.match(vagas, new RegExp(`className="${c}[ "]`), c)
    assert.match(css, new RegExp(`\\.${c}`), `${c} tem estilo`)
  }
})

test('barra inferior: Lojinha acesa e Descubra laranja também em Vagas', () => {
  const nav = ler('../../turista/src/components/layout/BottomNav.jsx')
  assert.match(nav, /label: 'Lojinha', tambem: \['\/transfers', '\/estacionamento'\]/)
  assert.match(nav, /<Aba to="\/passeios" icon=\{Store\} label="Lojinha" tambem=\{\['\/transfers', '\/estacionamento'\]\} \/>/)
  assert.match(nav, /\|\| pathname === '\/transfers' \|\| pathname === '\/estacionamento'/)
})
