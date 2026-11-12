// Página inicial no PC (12/11/2026): menu que estourava a tela em 1024px,
// "Sobre nós" 2px abaixo dos outros itens, região cortada e repetida, título
// ilegível sobre o banner, cartão sozinho em "Serviços em destaque" e a barra
// "Instale o app" desalinhada (e escondida sob o menu ao rolar). O celular não
// muda (conferido pixel a pixel).

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const menu = ler('../../turista/src/components/layout/TopNav.jsx')
const layout = ler('../../turista/src/components/layout/Layout.jsx')
const barra = ler('../../turista/src/components/InstallBar.jsx')
const inicio = ler('../../turista/src/pages/HomeDesktop.jsx')
const locais = Object.fromEntries(['pt', 'en', 'es'].map((l) => [l, JSON.parse(ler(`../../turista/src/i18n/locales/${l}.json`))]))

test('menu: uma linha só em 1024px (sem quebrar itens nem rolar para o lado)', () => {
  assert.match(menu, /`whitespace-nowrap text-\[13px\] xl:text-sm font-medium/)
  assert.match(menu, /<nav className="flex items-center gap-3 xl:gap-5 2xl:gap-6 flex-1 min-w-0">/)
  assert.match(menu, /<span className="hidden xl:inline text-sm text-gray-600 whitespace-nowrap">/, 'nome só onde cabe')
  assert.match(menu, /aria-label=\{t\('nav\.logout'\)\}/, 'o "Sair" em ícone continua com nome acessível')
})

test('"Sobre nós" com a mesma caixa dos outros itens (estava 2px abaixo)', () => {
  assert.match(menu, /<a href="\/#sobre" onClick=\{irParaSobre\} className=\{navLinkClass\(\{ isActive: false \}\)\}>/)
})

test('região: nome inteiro a partir de 1280px e sem a faixa repetida na home', () => {
  assert.match(menu, /max-w-\[90px\] xl:max-w-\[200px\] 2xl:max-w-\[260px\] truncate/)
  assert.match(menu, /title=\{region\?\.name \|\| undefined\}/, 'nome completo ao passar o mouse quando corta')
  assert.match(layout, /const mostraRegiao = pathname\.startsWith\('\/passeios'\) \|\| pathname\.startsWith\('\/transfers'\)/)
  assert.doesNotMatch(inicio, /<MapPin size=\{13\} \/> \{placeName\}/, 'sem a legenda com o nome no canto da foto')
  assert.match(inicio, /'grid-cols-\[1\.2fr_1\.2fr_1fr\]' : 'grid-cols-\[1\.45fr_1fr_1fr\]'/, '"Saindo de" da busca mais largo')
})

test('título legível sobre qualquer banner: desfoque e véu na coluna do texto', () => {
  assert.match(inicio, /backdropFilter: 'blur\(10px\)', WebkitBackdropFilter: 'blur\(10px\)'/)
  assert.match(inicio, /maskImage: 'linear-gradient\(90deg, #000 0%, #000 46%, transparent 68%\)'/)
  assert.match(inicio, /rgba\(255,253,250,\.97\) 0%, rgba\(255,253,250,\.93\) 36%/)
  assert.doesNotMatch(inicio, /from-white\/90 via-white\/55 to-white\/10/, 'sem o véu antigo (55% bem onde fica o título)')
})

test('"Serviços em destaque" fecha a fileira com o convite ao catálogo', () => {
  assert.match(inicio, /const sobra = \(gridRest\.length \+ featuredRoutes\.length\) % 3/)
  assert.match(inicio, /\$\{sobra === 1 \? 'col-span-2' : ''\}/)
  assert.match(inicio, /t\('homePg\.moreToursTitle', \{ place: placeShort \}\)/)
  for (const l of ['pt', 'en', 'es']) {
    assert.ok(locais[l].homePg.moreToursTitle.includes('{{place}}'), `${l}: moreToursTitle`)
    assert.ok(locais[l].homePg.moreToursText, `${l}: moreToursText`)
  }
})

test('barra "Instale o app": no PC alinha com a página e não fica sob o menu', () => {
  assert.match(barra, /<div className="sticky top-0 z-40 bg-brand text-white lg:static">/)
  assert.match(barra, /<div className="px-4 py-2 flex items-center gap-2 lg:max-w-\[1520px\] lg:mx-auto lg:px-10 xl:px-16">/)
})
