// Operações (Dashboard do operador): só reserva PAGA pode ser despachada.
//
// Bug relatado: reservas apareciam como "Atribuído" com botão Despachar mesmo
// sem o cliente ter pago. A tela de Despacho já filtrava por status_commercial
// === 'paid'; a de Operações mostrava o estado operacional cru ('assigned' vem
// do aceite, antes do pagamento) e oferecia o despacho.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const fonte = fs.readFileSync(
  new URL('../../operador/src/pages/Dashboard.jsx', import.meta.url), 'utf8')

test('só reserva paga é despachável', () => {
  assert.match(fonte, /const estaPago = \(b\) => b\?\.status_commercial === 'paid'/,
    'a regra do que pode despachar é o pagamento, não o estado operacional')
})

test('sem pagamento, o botão de despacho não aparece (fica atrás de `pago`)', () => {
  // Nas duas visões (tabela e card mobile) as AÇÕES só existem quando a reserva
  // está paga e não cancelada — o status em si aparece no selo, não repetido.
  const ocorrencias = fonte.match(/pago && !cancelInfo\(b\)\.cancelada &&/g) || []
  assert.ok(ocorrencias.length >= 2, 'a trava das ações precisa valer na tabela e no card mobile')
  // O selo (seloDe) ainda rotula "Aguardando pagamento" no topo do card.
  assert.match(fonte, /Aguardando pagamento/, 'o selo do topo informa o status')
})

test('o selo não diz "Atribuído" antes do pagamento', () => {
  assert.match(fonte, /function seloDe/, 'o selo passa pelo filtro de pagamento')
  assert.match(fonte, /!estaPago\(b\).*return STATUS\.awaiting_payment/s,
    'sem pagamento o selo é "Aguardando pagamento", não o estado operacional')
  const i = fonte.indexOf('function BookingRow')
  const bloco = fonte.slice(i, i + 200)
  assert.match(bloco, /const st\s*=\s*seloDe\(b\)/, 'a linha usa o selo filtrado')
})
