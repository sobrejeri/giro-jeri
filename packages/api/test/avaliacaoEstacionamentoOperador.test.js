// Aba de Avaliações para o operador de ESTACIONAMENTO.
//
// As avaliações de estacionamento ficam em parking_reviews (domínio separado
// das reviews de passeio/translado). A tela de Reputação do operador lia só a
// tabela reviews, então o operador de estacionamento nunca via nota — e o menu
// do segmento parking nem tinha o item. Agora o endpoint mescla as duas fontes
// e o menu do estacionamento ganha "Avaliações". Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const operator = read('../src/routes/operator.js')
const sidebar  = read('../../operador/src/components/layout/Sidebar.jsx')

test('/operator/reviews mescla as avaliações de estacionamento', () => {
  // Acha os pátios do operador e lê as reviews deles.
  assert.match(operator, /parking_lots'\)\.select\('id, name'\)\.eq\('owner_user_id', req\.user\.id\)/,
    'resolve os pátios do operador')
  assert.match(operator, /from\('parking_reviews'\)[\s\S]*?\.in\('lot_id', lotIds\)/,
    'lê as avaliações dos pátios do operador')
  assert.match(operator, /service_type: 'parking'/, 'marca a origem como estacionamento')
  // Mescla as duas fontes (passeio/translado + estacionamento) numa lista só.
  assert.match(operator, /\[\.\.\.rows\.map\(normTour\), \.\.\.prows\.map\(normParking\)\]/,
    'junta reviews de passeio/translado com as de estacionamento')
})

test('a soma do estacionamento não quebra sem as tabelas (tolerante)', () => {
  assert.match(operator, /catch \{ \/\* estacionamento ausente → ignora \*\/ \}/,
    'degrada para só passeios se o estacionamento não existir')
})

test('o menu do operador de estacionamento tem a aba Avaliações', () => {
  // Dentro do NAV_PARKING (menu dedicado do segmento parking).
  const i = sidebar.indexOf('NAV_PARKING')
  const fim = sidebar.indexOf('const NAV ', i)
  const bloco = sidebar.slice(i, fim === -1 ? sidebar.length : fim)
  assert.match(bloco, /to: '\/reputacao'[\s\S]*?label: 'Avaliações'/,
    'o menu de estacionamento aponta para a tela de Reputação')
})
