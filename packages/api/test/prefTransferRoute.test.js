// Preferência de rota de transfer: o entity_type do front tem de bater com o
// que o backend E o banco aceitam.
//
// Bug: a tela de Rotas mandava entity_type 'transfer_route', mas o enum da
// rota e o CHECK do banco só aceitam tour/vehicle/transfer/modal. Toda troca
// de toggle voltava 400 "entity_type inválido" e nada salvava.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const rotas   = fs.readFileSync(new URL('../../operador/src/pages/Rotas.jsx', import.meta.url), 'utf8')
const backend = fs.readFileSync(new URL('../src/routes/operator.js', import.meta.url), 'utf8')

test('a tela de Rotas usa entity_type "transfer" (não "transfer_route")', () => {
  assert.match(rotas, /setPreference\('transfer',/, 'o write precisa usar um tipo aceito')
  assert.match(rotas, /p\.entity_type === 'transfer'/, 'a leitura precisa casar com o que foi gravado')
  // No CÓDIGO (fora comentários) não pode sobrar o tipo recusado.
  const semComentarios = rotas.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/transfer_route/.test(semComentarios), 'nenhum resquício do tipo recusado no código')
})

test('o backend aceita "transfer"', () => {
  const i = backend.indexOf("router.put('/preferences/:type/:entityId'")
  const fn = backend.slice(i, backend.indexOf('\nrouter.', i + 10))
  const m = fn.match(/\[([^\]]*)\]\.includes\(type\)/)
  assert.ok(m, 'a rota precisa validar o type contra uma lista')
  assert.match(m[1], /'transfer'/, 'transfer tem de estar entre os aceitos')
})

test('o CHECK do banco inclui "transfer" (senão o upsert falha mesmo passando no enum)', () => {
  const mig = fs.readFileSync(new URL('../../../supabase/migrations/076_operador_por_modal.sql', import.meta.url), 'utf8')
  assert.match(mig, /CHECK \(entity_type IN \([^)]*'transfer'[^)]*\)\)/,
    'o valor usado precisa ser aceito pelo CHECK do banco')
})
