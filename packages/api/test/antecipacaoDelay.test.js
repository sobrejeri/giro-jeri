// Antecipação automática: delay baixo = operador recebe no próximo dia útil.
//
// O payload de antecipação automática mandava `delay: null`. A Pagar.me, sem o
// campo, assume o padrão dela (365 dias) — aí quase nada é antecipado e o
// dinheiro do cartão só cai na liquidação natural (D+30). `delay` é a quantidade
// de dias que NÃO entram no valor antecipável (contados para trás): quanto
// MENOR, mais cedo o operador recebe. Com delay = 1, antecipa ~tudo → próximo
// dia útil. Este teste trava o default em 1 (e != null). Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const pagarme = read('../src/payments/pagarme.js')

test('o delay padrão da antecipação é 1 dia (não null)', () => {
  assert.match(pagarme, /const ANTICIPATION_DELAY_DAYS = 1\b/, 'o delay padrão é 1 dia')
  assert.match(pagarme, /delay = ANTICIPATION_DELAY_DAYS/, 'anticipationSettings usa o default de 1 dia')
  assert.doesNotMatch(pagarme, /delay = null/, 'não volta a mandar delay null (que vira 365 na Pagar.me)')
})

test('o payload de antecipação ainda manda o campo delay', () => {
  assert.match(pagarme, /return \{ enabled, type, volume_percentage: String\(volumePercentage\), delay \}/,
    'o corpo enviado à Pagar.me inclui o delay')
})
