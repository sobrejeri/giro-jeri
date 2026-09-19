// Filtro por categoria nas telas de catálogo do operador (Rotas, Passeios,
// Veículos). Um componente só, alimentado pelo campo de categoria de cada tela.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')

test('o componente esconde o filtro quando há 0 ou 1 categoria', () => {
  const comp = ler('../../operador/src/components/FiltroCategorias.jsx')
  assert.match(comp, /categorias\.length <= 1\) return null/,
    'filtro com uma opção só é ruído')
  assert.match(comp, /valor === null/, '"Todas" é o estado sem filtro')
})

test('Rotas filtra pela categoria do transfer pai', () => {
  const src = ler('../../operador/src/pages/Rotas.jsx')
  assert.match(src, /import FiltroCategorias/)
  assert.match(src, /r\.transfers\?\.name/, 'categoria da rota = transfer pai')
  assert.match(src, /catDaRota\(r\)\[0\] === cat/, 'a lista é filtrada pela categoria escolhida')
})

test('Passeios filtra pela categoria do catálogo', () => {
  const src = ler('../../operador/src/pages/Passeios.jsx')
  assert.match(src, /import FiltroCategorias/)
  assert.match(src, /t\.categories\?\.name/, 'categoria do passeio = categoria do tour')
  assert.match(src, /catDoPasseio\(t\)\[0\] === cat/)
})

test('Veículos filtra pelo tipo do veículo', () => {
  const src = ler('../../operador/src/pages/Veiculos.jsx')
  assert.match(src, /import FiltroCategorias/)
  assert.match(src, /v\.vehicle_type/, 'categoria do veículo = tipo')
  assert.match(src, /catDoVeiculo\(v\)\[0\] === cat/)
})
