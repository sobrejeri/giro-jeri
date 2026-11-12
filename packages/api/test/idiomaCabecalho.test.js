// Idioma no cabeçalho laranja da Lojinha (Passeios, Translados, Vagas), só no
// celular: bandeira + sigla (🇧🇷 PT · 🇺🇸 EN · 🇪🇸 ES) logo abaixo da lupa, do
// sino e do carrinho, cada pastilha debaixo de um botão. Pedido do dono em
// 12/11/2026. Junto, as abas e o "Saindo de" passaram a seguir o idioma.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const seletor = ler('../../turista/src/components/HeaderLanguagePicker.jsx')
const css = ler('../../turista/src/pages/ToursVisual2026.css')
const paginas = {
  Tours: ler('../../turista/src/pages/Tours.jsx'),
  Transfers: ler('../../turista/src/pages/Transfers.jsx'),
  Estacionamento: ler('../../turista/src/pages/Estacionamento.jsx'),
}
const locais = Object.fromEntries(['pt', 'en', 'es'].map((l) => [l, JSON.parse(ler(`../../turista/src/i18n/locales/${l}.json`))]))

test('o seletor usa a mesma troca do Perfil (setLang) e mostra bandeira + sigla', () => {
  assert.match(seletor, /import \{ setLang, LANGS \} from '\.\.\/i18n\/index\.js'/)
  assert.match(seletor, /role="group" aria-label=\{t\('profile\.language'\)\} className="t2026-langs"/)
  assert.match(seletor, /aria-pressed=\{ativo\}/, 'leitor de tela sabe qual está ativo')
  assert.match(seletor, /aria-label=\{`\$\{lang\.label\} \(\$\{sigla\}\)`\}/, 'nome falado inclui a sigla que aparece')
  assert.match(seletor, /<span aria-hidden="true">\{lang\.flag\}<\/span>\s*\{sigla\}/)
  assert.match(seletor, /onClick=\{\(\) => \{ if \(!ativo\) setLang\(lang\.code\) \}\}/)
})

test('fica no cabeçalho das 3 abas, logo depois da linha da marca (antes da busca)', () => {
  for (const [nome, src] of Object.entries(paginas)) {
    assert.match(src, /import HeaderLanguagePicker from '\.\.\/components\/HeaderLanguagePicker'/, nome)
    const cabecalho = src.split('t2026-header')[1].split('t2026-location')[0]
    assert.ok(cabecalho.includes('<HeaderLanguagePicker />'), `${nome}: dentro do cabeçalho laranja`)
    assert.ok(cabecalho.indexOf('aria-label={t(\'toursPg.cartAria\')}') < cabecalho.indexOf('<HeaderLanguagePicker />'), `${nome}: abaixo dos botões`)
    const busca = cabecalho.indexOf('showSearch && (')
    if (busca !== -1) assert.ok(cabecalho.indexOf('<HeaderLanguagePicker />') < busca, `${nome}: a busca abre embaixo das bandeiras`)
  }
  // Na Lojinha, só no visual novo (o "original" do comparador fica como era).
  assert.match(paginas.Tours, /\{visual2026 && <HeaderLanguagePicker \/>\}/)
})

test('uma pastilha debaixo de cada botão: mesma largura e espaço, também no celular pequeno', () => {
  assert.match(css, /\.t2026-header \.absolute\.right-0 \{\s*gap: 5px;/)
  assert.match(css, /\.t2026-header \.absolute\.right-0 > div > button \{\s*display: flex;[^}]*height: 36px;\s*width: 36px;/)
  assert.match(css, /\.t2026-langs \{\s*display: grid;\s*grid-template-columns: repeat\(3, 36px\);\s*column-gap: 5px;/)
  assert.match(css, /\.t2026-langs > button\[aria-pressed="true"\] \{[^}]*background: white;/, 'a ativa em branco')
  const pequeno = css.slice(css.indexOf('@media (max-width: 359px)'))
  assert.match(pequeno, /\.absolute\.right-0 \{gap: 3px;\}/)
  assert.match(pequeno, /\{height: 31px;width:31px;\}/)
  assert.match(pequeno, /\.t2026-langs \{grid-template-columns: repeat\(3, 31px\); column-gap: 3px;\}/)
})

test('só no celular: tudo dentro do @media e o cabeçalho compensa a linha nova', () => {
  const inicioMedia = css.indexOf('@media (max-width: 1023px)')
  assert.ok(css.indexOf('.t2026-langs') > inicioMedia)
  assert.match(css, /padding: 29px 16px 50px;/)
})

test('abas e "Saindo de" seguem o idioma escolhido (pt / en / es)', () => {
  for (const [nome, src] of Object.entries(paginas)) {
    assert.doesNotMatch(src, />Saindo de: </, `${nome}: sem "Saindo de" fixo no cartão da cidade`)
    assert.doesNotMatch(src, /aria-label="Trocar a cidade de saída"/, nome)
    assert.match(src, /aria-label=\{t\('homePg\.changeLeavingFrom'\)\}/, nome)
    assert.match(src, /\{t\('homePg\.leavingFrom'\)\}: <strong/, nome)
    const abas = src.split('t2026-tabs')[1].split('</div>')[0]
    for (const chave of ['estacionamentoPg.desktop.breadcrumbTours', 'estacionamentoPg.list.tabTransfers', 'estacionamentoPg.desktop.spotsCrumb']) {
      assert.ok(abas.includes(`t('${chave}')`), `${nome}: aba ${chave} traduzida`)
    }
  }
  assert.equal(locais.pt.homePg.changeLeavingFrom, 'Trocar a cidade de saída')
  assert.equal(locais.en.homePg.changeLeavingFrom, 'Change departure city')
  assert.equal(locais.es.homePg.changeLeavingFrom, 'Cambiar la ciudad de salida')
  assert.deepEqual(['pt', 'en', 'es'].map((l) => locais[l].homePg.leavingFrom), ['Saindo de', 'Leaving from', 'Saliendo de'])
})
