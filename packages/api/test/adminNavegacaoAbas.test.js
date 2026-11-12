// Admin, PC e celular: o título do cabeçalho é o nome da ÁREA (igual ao menu
// lateral) e as ferramentas da área viram abas numa linha só, logo abaixo do
// cabeçalho e fora da rolagem do conteúdo. Antes era um cartão dentro da página
// com o nome da área repetido e links quebrando em duas linhas no celular; o
// cabeçalho usava uma lista própria de títulos que não batia com o menu.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const nav = ler('../../admin/src/components/layout/navigation.js')
const cabecalho = ler('../../admin/src/components/layout/Header.jsx')
const layout = ler('../../admin/src/components/layout/Layout.jsx')
const abas = ler('../../admin/src/components/layout/AreaNavigation.jsx')
const css = ler('../../admin/src/index.css')
const pagina = (n) => ler(`../../admin/src/pages/${n}.jsx`)

test('o título do cabeçalho vem do menu (nome da área), sem lista própria', () => {
  assert.match(nav, /export const getTitle = \(pathname\) =>\s*getArea\(pathname\)\?\.label \|\| OUTRAS_TELAS\[/)
  assert.match(nav, /const OUTRAS_TELAS = \{ '\/perfil': 'Meu perfil' \}/)
  assert.match(cabecalho, /const title\s+= getTitle\(pathname\)/)
  assert.doesNotMatch(cabecalho, /const TITLES = \{/, 'a lista antiga ("Motor de Preços", "Gestão de Usuários"…) saiu')
})

test('as abas da área ficam sob o cabeçalho, fora da rolagem do conteúdo', () => {
  const iAbas = layout.indexOf('<AreaNavigation />')
  assert.ok(iAbas > layout.indexOf('<Header ') && iAbas < layout.indexOf('<main'), 'entre o cabeçalho e o <main>')
})

test('abas numa linha só, que rolam para o lado, com a ativa trazida à vista', () => {
  assert.match(abas, /className="flex gap-1 overflow-x-auto scrollbar-hide px-2 sm:px-4"/)
  assert.match(abas, /whitespace-nowrap/)
  assert.match(abas, /min-h-11/, 'alvo de toque de 44px')
  assert.match(abas, /aria-current=\{ativa \? 'page' : undefined\}/)
  assert.match(abas, /el\.scrollLeft = Math\.max\(0, ativa\.offsetLeft - \(el\.clientWidth - ativa\.offsetWidth\) \/ 2\)/)
  assert.match(abas, /if \(!area \|\| area\.links\.length < 2\) return null/, 'área de uma tela só não ganha faixa')
  assert.match(css, /\.scrollbar-hide \{ scrollbar-width: none;/, 'utilitário que o admin usava mas não tinha')
})

test('títulos dentro das telas: h2 (o h1 é o do cabeçalho) e com o nome da aba', () => {
  for (const n of ['Conteudo', 'Dashboard', 'Estabelecimentos', 'Estacionamentos', 'Feed', 'Marketing', 'Notificacoes', 'Repasses', 'Stories']) {
    assert.doesNotMatch(pagina(n), /<h1[\s>]/, `${n}: sem segundo h1`)
  }
  assert.match(pagina('Notificacoes'), />Envios e automações<\/h2>/)
  assert.match(pagina('Marketing'), />Rastreamento e anúncios<\/h2>/)
  assert.match(pagina('Conteudo'), />Publicações<\/h2>/)
})
