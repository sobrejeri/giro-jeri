// Serviço "não combinável" (aéreo): isolamento no carrinho + config no admin.
//
// Aéreo é de valor alto e tem executor único. Num combo (mesmo order_group_id)
// com operadores diferentes o split do cartão é DESLIGADO — então o aéreo
// precisa sair do grupo compartilhado e virar pedido próprio (operador único),
// onde o splitDoPagarme já divide plataforma + executor. Este teste trava esse
// isolamento: se alguém voltar a enfiar o aéreo no order_group_id do carrinho,
// o split some em silêncio e o repasse ao executor some junto. Asserção de
// fonte (sem API real), no estilo dos demais testes do carrinho.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const payments = fs.readFileSync(
  new URL('../src/routes/payments.js', import.meta.url), 'utf8')
const admin = fs.readFileSync(
  new URL('../src/routes/admin.js', import.meta.url), 'utf8')

test('o carrinho resolve os itens "não combináveis" pelo modal do serviço', () => {
  assert.match(payments, /const standaloneByIndex = await/)
  assert.match(payments, /modalDaReserva/, 'o isolamento é por modal (categoria/translado → service_modals)')
  assert.match(payments, /from\('service_modals'\)\s*\.select\('slug, is_standalone'\)/,
    'lê a flag is_standalone por slug de modal')
})

test('item não combinável recebe order_group_id PRÓPRIO (sai do combo)', () => {
  assert.match(payments,
    /order_group_id:\s*standaloneByIndex\[i\] \? crypto\.randomUUID\(\) : orderGroupId/,
    'o standalone nunca compartilha o grupo do carrinho — é o que mantém o split vivo')
})

test('sem a migração 109 (coluna ausente) nada é isolado — degrada p/ hoje', () => {
  // Fail-open de recurso: se is_standalone não existe, o carrinho segue combinando.
  assert.match(payments, /if \(error\) return prepared\.map\(\(\) => false\)/,
    'coluna ausente → ninguém vira standalone (comportamento atual preservado)')
})

test('admin lê e grava a flag "não combinável" por modal', () => {
  assert.match(admin, /router\.get\('\/service-modals'/, 'lista os modais com a flag')
  assert.match(admin, /is_standalone: z\.boolean\(\)/, 'o PUT valida o toggle booleano')
  assert.match(admin, /router\.put\('\/service-modals\/:id'/)
  assert.match(admin, /\.update\(\{ is_standalone \}\)/)
})

test('admin avisa (não dá 500) quando a migração 109 não rodou', () => {
  assert.match(admin, /109_standalone_service\.sql/,
    'sem a coluna, o admin instrui a rodar a migração em vez de estourar')
})
