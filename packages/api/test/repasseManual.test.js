// Repasse manual a operadores/motoristas: aceitar corrida NÃO exige conexão
// de recebimento (Mercado Pago / Pagar.me). O "porteiro" mpGate foi desativado —
// se alguém reintroduzir o bloqueio, o operador volta a não conseguir aceitar
// sem conectar uma conta, que é justamente o que o produto decidiu remover.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const operador = fs.readFileSync(new URL('../src/routes/operator.js', import.meta.url), 'utf8')

test('mpGate não bloqueia aceite (repasse manual)', () => {
  const i = operador.indexOf('async function mpGate')
  assert.notEqual(i, -1)
  const fn = operador.slice(i, i + 400)
  // Corpo curto que só retorna null — sem mensagem de bloqueio.
  assert.ok(/return null/.test(fn), 'mpGate precisa liberar o aceite (return null)')
  assert.ok(!/Conecte sua conta Mercado Pago/.test(fn),
    'não pode voltar a exigir conexão de Mercado Pago para aceitar')
})

test('a fila continua chamando mpGate (o ponto de decisão segue existindo)', () => {
  // Mantido para reversão fácil no futuro; hoje sempre libera.
  assert.ok(/await mpGate\(/.test(operador), 'o aceite ainda passa pelo porteiro (desativado)')
})
