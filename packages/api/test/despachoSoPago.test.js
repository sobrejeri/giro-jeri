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

test('sem pagamento, a linha mostra o botão de despacho substituído por aviso', () => {
  // Nas duas visões (tabela e card mobile) o botão Despachar fica atrás de `pago`.
  const ocorrencias = fonte.match(/\{!pago \? \(/g) || []
  assert.ok(ocorrencias.length >= 2, 'a trava do botão precisa valer na tabela e no card mobile')
  assert.match(fonte, /Aguardando pagamento/, 'o aviso substitui o botão')
})

test('o selo não diz "Atribuído" antes do pagamento', () => {
  assert.match(fonte, /function seloDe/, 'o selo passa pelo filtro de pagamento')
  assert.match(fonte, /!estaPago\(b\).*return STATUS\.awaiting_payment/s,
    'sem pagamento o selo é "Aguardando pagamento", não o estado operacional')
  const i = fonte.indexOf('function BookingRow')
  const bloco = fonte.slice(i, i + 200)
  assert.match(bloco, /const st\s*=\s*seloDe\(b\)/, 'a linha usa o selo filtrado')
})
