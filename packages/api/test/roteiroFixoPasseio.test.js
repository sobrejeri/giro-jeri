// Passeio escolhido sob cotação: não repedir roteiro no formulário.
// Regra pura: nenhuma chamada de rede/banco/gateway.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { roteiroFixoDoPasseio, PARTIDA_A_COMBINAR } from '../../turista/src/lib/roteiroFixoPasseio.js'

const tour = (extras = {}) => ({
  id: 'd5d1fe86-8cf5-4d94-8326-fbf485348c7b',
  name: 'Pôr do Sol na Duna — Experiência Premium',
  quote_only: true, quote_stops: [], meeting_point_name: null,
  ...extras,
})

test('passeio da imagem, sem paradas e sem ponto cadastrado: origem a combinar, nunca inventar rota', () => {
  assert.deepEqual(roteiroFixoDoPasseio(tour()), {
    origin_place_name: PARTIDA_A_COMBINAR,
    stops: [],
  })
})

test('passeio com ponto fixo e paradas cadastradas preserva roteiro do administrador', () => {
  const ponto = 'Ponto de saída — Vila'
  const stopId = 'd86e4a50-3f74-41da-97af-123456789abc'
  const body = roteiroFixoDoPasseio(tour({
    meeting_point_name: ponto, meeting_latitude: -2.79, meeting_longitude: -40.51,
    quote_stops: [{ name: 'Praia do Preá', stop_id: stopId }, { name: 'Lagoa do Paraíso' }],
  }))
  assert.equal(body.origin_place_name, ponto)
  assert.equal(body.origin_latitude, -2.79)
  assert.equal(body.origin_longitude, -40.51)
  assert.deepEqual(body.stops, [
    { name: 'Praia do Preá', lat: null, lng: null, stop_id: stopId },
    { name: 'Lagoa do Paraíso', lat: null, lng: null, outro: true },
  ])
})

test('sem coordenadas válidas não envia 0, NaN ou coordenadas inventadas', () => {
  const b = roteiroFixoDoPasseio(tour({
    meeting_point_name: 'Ponto combinado', meeting_latitude: null, meeting_longitude: null,
  }))
  assert.equal(b.origin_place_name, 'Ponto combinado')
  assert.equal('origin_latitude' in b, false)
  assert.equal('origin_longitude' in b, false)
})

test('nome de parada vazio ou stop_id inválido não quebra o envio', () => {
  const b = roteiroFixoDoPasseio(tour({
    quote_stops: [{ name: '' }, null, { name: '  Dunas  ', stop_id: 'não-uuid' }],
  }))
  assert.deepEqual(b.stops, [{ name: 'Dunas', lat: null, lng: null, outro: true }])
})

test('montagem livre e passeio de preço fixo não recebem roteiro de cotação inventado', () => {
  assert.equal(roteiroFixoDoPasseio(null), null)
  assert.equal(roteiroFixoDoPasseio(tour({ quote_only: false })), null)
  assert.equal(roteiroFixoDoPasseio(tour({ id: null })), null)
})

test('tela oculta ROTEIRO só com passeio selecionado, preserva editor na montagem livre e dados no envio', () => {
  const src = fs.readFileSync(new URL('../../turista/src/pages/PasseioPersonalizado.jsx', import.meta.url), 'utf8')
  assert.match(src, /\{!passeioId && \(\s*<section className="bg-white rounded-2xl border border-gray-100 relative overflow-visible"/)
  assert.match(src, /\.\.\.\(roteiroFixo \|\| \{/)
  assert.match(src, /passeioId \? !!roteiroFixo : origin\.trim\(\)\.length >= 2/)
  assert.match(src, /Descrição do passeio: /, 'quando não há quote_stops a descrição acompanha a cotação')
  assert.match(src, /Ponto de partida a combinar com a cooperativa/)
  assert.match(src, /Veículos desejados/)
  assert.match(src, /Serviços adicionais/)
})
