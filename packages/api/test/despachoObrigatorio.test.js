// Despacho: todos os campos obrigatórios, MENOS observações.
//
// Antes, os dados de repasse (CPF/CNPJ, chave PIX, tipo) eram opcionais — a
// corrida saía e o pagamento ficava pendente. A pedido, agora são exigidos.
// O ponto que o teste trava: a MESMA regra vale para o botão e para o submit,
// senão um libera o que o outro recusa.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// A validação e o formulário de despacho vivem no componente compartilhado
// DespacharModal, usado pelas telas Despacho e Operações (Dashboard).
const fonte = fs.readFileSync(
  new URL('../../operador/src/components/DespacharModal.jsx', import.meta.url), 'utf8')

const i = fonte.indexOf('function podeDespachar')
assert.notEqual(i, -1, 'a validação centralizada precisa existir')
const fn = fonte.slice(i, fonte.indexOf('\n}', i) + 2)

test('exige veículo, motorista, WhatsApp e os dados de repasse', () => {
  for (const campo of ['real_vehicle_text', 'driver_name', 'driver_phone',
                       'driver_document', 'driver_pix_key', 'driver_pix_key_type']) {
    assert.match(fn, new RegExp(`f\\.${campo}\\.trim\\(\\)`), `${campo} tem de ser obrigatório`)
  }
})

test('observações NÃO é exigida', () => {
  assert.ok(!/dispatch_notes/.test(fn), 'observações é o único campo livre')
})

test('botão e submit usam a MESMA regra', () => {
  assert.match(fonte, /if \(!podeDespachar\(form\)\) return/, 'o submit recusa pela mesma regra')
  assert.match(fonte, /const canDispatch = podeDespachar\(form\)/, 'o botão desabilita pela mesma regra')
})

test('o texto não promete mais que o repasse é opcional', () => {
  const i2 = fonte.indexOf('Dados para o repasse')
  const bloco = fonte.slice(i2, i2 + 400)
  assert.ok(!/Opcional/.test(bloco), 'não pode dizer "Opcional" num campo agora obrigatório')
  assert.match(bloco, /Obrigatório/)
})
