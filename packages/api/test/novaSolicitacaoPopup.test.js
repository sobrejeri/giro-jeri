// Pop-up flutuante de nova solicitação na tela do operador.
//
// O ponto que os testes travam não é visual: é que "Recusar" NÃO pode virar um
// cancelamento no servidor. O modelo é primeiro-a-aceitar; recusar só esconde o
// aviso PARA ESTE operador. Um dia alguém pode "consertar" isso ligando o botão
// a uma rota de cancelar — e aí um operador tira a corrida de todos os outros.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const fonte = fs.readFileSync(
  new URL('../../operador/src/components/NovaSolicitacaoPopup.jsx', import.meta.url), 'utf8')

test('reusa a MESMA query do feed — sem polling em dobro', () => {
  assert.match(fonte, /queryKey:\s*\['operator-bookings'\]/,
    'chave diferente criaria uma segunda chamada ao feed a cada 6s')
})

test('Aceitar chama o aceite certo por tipo de item', () => {
  assert.match(fonte, /api\.acceptLeg\(id\)/,  'perna aceita por leg_id')
  assert.match(fonte, /api\.acceptBooking\(id\)/, 'reserva aceita por id')
  assert.match(fonte, /invalidateQueries\(\{ queryKey: \['operator-bookings'\] \}\)/)
})

test('Recusar é LOCAL — não chama nada de cancelar/recusar no servidor', () => {
  assert.match(fonte, /function dispensar/, 'recusar apenas dispensa localmente')
  assert.match(fonte, /localStorage\.setItem/, 'a dispensa persiste para não repiscar a cada polling')
  // A garantia central: nada de rota de cancelamento por trás do "Recusar".
  assert.ok(!/api\.(reject|recusar|cancel|decline)/i.test(fonte),
    'Recusar não pode cancelar a corrida para os outros operadores')
})

test('o id do item respeita perna vs reserva', () => {
  assert.match(fonte, /it\.kind === 'leg' \? it\.leg_id : it\.id/)
})

test('conflito (outro aceitou antes) some com o card, não trava', () => {
  assert.match(fonte, /já foi aceita|=== 409/, 'trata o caso de corrida já aceita')
})

test('o pop-up é montado no Layout — aparece em qualquer tela', () => {
  const layout = fs.readFileSync(
    new URL('../../operador/src/components/layout/Layout.jsx', import.meta.url), 'utf8')
  assert.match(layout, /import NovaSolicitacaoPopup/)
  assert.match(layout, /<NovaSolicitacaoPopup \/>/)
})
