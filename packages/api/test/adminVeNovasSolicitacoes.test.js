// Admin no app do operador vê e aceita as solicitações NOVAS.
//
// Antes o feed do admin trazia só as solicitações EXPIRADAS (que nenhuma coop
// pegou no prazo). O admin que opera pelo app não via um pedido novo, não tinha
// como aceitar — e o cliente ficava sem a opção de pagar. No painel, a mesma
// reserva aparecia em "Ativas" como "Aguardando pagamento", escondendo que o
// que faltava era o aceite. Asserção de fonte, como o resto da suíte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const operador  = ler('../src/routes/operator.js')
const dashboard = ler('../../operador/src/pages/Dashboard.jsx')

const i = operador.indexOf("router.get('/bookings'")
const feed = operador.slice(i, operador.indexOf("\nrouter.", i + 10))

test('o feed do admin traz todas as solicitações aguardando aceite', () => {
  assert.match(feed, /let acceptanceRows = isAdmin \? all : within;/)
  assert.doesNotMatch(feed, /isAdmin \? expired/, 'não volta a esconder os pedidos novos do admin')
})

test('a janela da lojinha (45s do operador preferido) vale também para o admin', () => {
  const j = feed.indexOf('Janela de prioridade da lojinha')
  const bloco = feed.slice(j, j + 900)
  assert.match(bloco, /b\.preferred_operator_id === req\.user\.id/)
  assert.doesNotMatch(bloco, /if \(!isAdmin\) \{\s*const nowP/, 'o filtro não pula mais o admin')
})

test('o aceite do admin continua sem a trava do prazo', () => {
  const k = operador.indexOf("router.post('/bookings/:id/accept'")
  const aceite = operador.slice(k, k + 4000)
  assert.match(aceite, /if \(!isAdmin\) acceptQuery = acceptQuery\.gt\('acceptance_expires_at', nowIso\)/)
})

test('no painel, reserva sem aceite é "Aguardando aceite" (não "Aguardando pagamento")', () => {
  assert.match(dashboard, /awaiting_acceptance: \{ label: 'Aguardando aceite'/)
  assert.match(dashboard, /if \(aguardaAceite\(b\)\) return STATUS\.awaiting_acceptance\s*\n\s*if \(!estaPago\(b\)/,
    'o aceite é conferido antes do pagamento')
  assert.match(dashboard, /onAceitar=\{abrirNovas\}/, 'o card leva para a aba Novas, onde fica o Aceitar')
})
