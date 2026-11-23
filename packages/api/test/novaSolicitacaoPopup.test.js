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
  assert.match(fonte, /api\.acceptLeg\(idDoItem\(item\)\)/,  'perna aceita por leg_id')
  assert.match(fonte, /api\.acceptBooking\(idDoItem\(item\)\)/, 'reserva aceita por id')
  // Combo do carrinho (order_group_id) é aceito de uma vez, atômico.
  assert.match(fonte, /api\.acceptGroup\(u\.gid\)/, 'pedido em grupo aceito pelo group id')
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

test('aceitar leva às Operações para visualizar a corrida ativa', () => {
  // A tela antiga /reservas foi incorporada ao cockpit (/dashboard).
  const from = fonte.indexOf('  async function aceitar(u)')
  const corpo = fonte.slice(from, fonte.indexOf('  if (!atual &&', from))
  assert.match(corpo, /navigate\('\/dashboard'\)/,
    'depois de aceitar, o operador deve cair na aba Ativas do cockpit')
})

test('Dashboard abre em Ativas e mantém Novas para itens ainda pendentes', () => {
  const dashboard = fs.readFileSync(
    new URL('../../operador/src/pages/Dashboard.jsx', import.meta.url), 'utf8')
  const app = fs.readFileSync(
    new URL('../../operador/src/App.jsx', import.meta.url), 'utf8')
  assert.match(dashboard, /searchParams\.get\('tab'\) === 'novas' \? 'novas' : 'active'/,
    'Dashboard abre em Ativas quando não vem com aba explícita')
  assert.match(dashboard, /const activeBooks = allBooks\.filter/,
    'Ativas lista o pipeline das reservas, inclusive aceitas que aguardam pagamento')
  assert.match(app, /path="reservas"\s+element=\{<Navigate to="\/dashboard\?tab=novas" replace \/>\}/,
    'links antigos de Solicitações continuam redirecionados ao cockpit')
})

test('Minhas corridas é ordenada por data de solicitação (mais recente primeiro)', () => {
  const reservas = fs.readFileSync(
    new URL('../../operador/src/pages/Reservas.jsx', import.meta.url), 'utf8')
  const i = reservas.indexOf('const mineItems')
  const bloco = reservas.slice(i, reservas.indexOf('const openGroupBookings', i))
  assert.match(bloco, /created_at/, 'a ordem é pela data de solicitação')
  assert.match(bloco, /out\.sort\(/, 'a lista precisa ser ordenada')
  assert.match(bloco, /solicitadoEm\(b\) - solicitadoEm\(a\)/, 'mais recente primeiro')
})

test('venda direta e pagamento aparecem como aviso flutuante (não só no sino)', () => {
  // Esses eventos não passam por aceite — a reserva já é do operador e paga —,
  // então não entram em `pending`. O pop-up lê as notificações e os flutua.
  assert.match(fonte, /queryKey:\s*\['notifications'\]/, 'o pop-up também observa as notificações')
  assert.match(fonte, /\^Venda direta\|\^Pagamento recebido/, 'detecta os avisos informativos pelo título')
  assert.match(fonte, /read_at/, 'só flutua o que ainda não foi lido')
  assert.match(fonte, /JANELA_AVISO_MS/, 'só notificação recente, para não chover histórico ao abrir')
})

test('o card informativo tem "Ver reserva" e não tem aceitar/recusar', () => {
  const i = fonte.indexOf('Card INFORMATIVO')
  assert.notEqual(i, -1, 'o ramo do card informativo precisa existir')
  // Isola só o ramo do card informativo (até o toast pós-ação) — depois dele
  // vêm o combo e a solicitação a aceitar, que naturalmente têm aceitar().
  const bloco = fonte.slice(i, fonte.indexOf('Toast curto', i))
  assert.match(bloco, /Ver reserva/)
  assert.match(bloco, /dispensarAviso/)
  assert.ok(!/aceitar\(/.test(bloco), 'venda direta já é do operador — nada de aceitar')
})

test('a solicitação a aceitar tem prioridade sobre o aviso informativo', () => {
  assert.match(fonte, /const avisoAtual = !atual \? avisosInfo\[0\] : null/,
    'com pendência de aceite, o aviso informativo espera')
})
