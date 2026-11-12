// Lojinha: o visual novo (PR #55) passa a ser o PADRÃO para todos os clientes.
//
// A comparação continua existindo só para quem abre ?turivaPreview=1 (dono do
// app conferindo) — e nela "Original" ainda volta ao visual antigo, então o
// retorno segue imediato. Aqui a regra roda de verdade (módulo puro do app do
// turista, com um localStorage falso); o resto é asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const preview = await import('../../turista/src/lib/toursVisualPreview.js')

function comArmazenamento(inicial = {}) {
  const dados = new Map(Object.entries(inicial))
  globalThis.window = {
    localStorage: {
      getItem: (k) => (dados.has(k) ? dados.get(k) : null),
      setItem: (k, v) => { dados.set(k, String(v)) },
      removeItem: (k) => { dados.delete(k) },
    },
  }
  return dados
}

test('cliente comum (sem prévia, sem nada salvo) já vê o visual novo', () => {
  comArmazenamento()
  const v = preview.readToursVisualPreview('')
  assert.equal(v.isNew, true)
  assert.equal(v.enabled, false, 'a barra de comparação não aparece para o público')
  assert.equal(v.variant, 'novo')
})

test('sem localStorage (aba anônima/bloqueada) também abre no visual novo', () => {
  delete globalThis.window
  assert.equal(preview.readToursVisualPreview('').isNew, true)
})

test('o público não troca de visual só pela URL: ?variant=original sem a prévia continua no novo', () => {
  comArmazenamento()
  assert.equal(preview.readToursVisualPreview('?variant=original').isNew, true)
})

test('na comparação (?turivaPreview=1) o "Original" ainda volta ao visual antigo', () => {
  comArmazenamento()
  const original = preview.readToursVisualPreview('?turivaPreview=1&variant=original')
  assert.equal(original.enabled, true)
  assert.equal(original.isNew, false)
  assert.equal(preview.readToursVisualPreview('?turivaPreview=1').isNew, true, 'comparação abre no novo por padrão')
})

test('quem salvou "Original" na comparação continua vendo o original até sair dela', () => {
  const dados = comArmazenamento({ 'turiva.loja-preview.enabled': '1', 'turiva.loja-preview.variant': 'original' })
  assert.equal(preview.readToursVisualPreview('').isNew, false)
  preview.clearToursVisualPreview()
  assert.equal(dados.size, 0)
  assert.equal(preview.readToursVisualPreview('').isNew, true, 'ao sair (X) volta ao padrão: novo')
})

test('no PC a faixa "Saindo de" continua na /passeios (o cartão de região do visual novo é só do celular)', () => {
  const layout = ler('../../turista/src/components/layout/Layout.jsx')
  assert.match(layout, /\{mostraRegiao && \(lojinhaNova \? <div className="hidden lg:block"><RegionBar \/><\/div> : <RegionBar \/>\)\}/)
  assert.doesNotMatch(layout, /&& !previewNovaLojinha/, 'a faixa não pode mais sumir também no PC')
  const tours = ler('../../turista/src/pages/Tours.jsx')
  assert.match(tours, /<div className=\{`lg:hidden min-h-screen pb-4 \$\{visual2026 \? 'turiva-tours-visual2026' : ''\}`\}>/,
    'o visual novo vive dentro do contêiner de celular')
})

test('a barra de comparação não promete mais "aprovação pendente"', () => {
  const barra = ler('../../turista/src/pages/ToursVisualSwitcher.jsx')
  assert.doesNotMatch(barra, /publicação definitiva depende da aprovação/)
  assert.match(barra, /Comparar visual da Lojinha/)
})
