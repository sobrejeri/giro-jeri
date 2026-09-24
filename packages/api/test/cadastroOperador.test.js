// Cadastro de operador aceita CPF (pessoa física), não só CNPJ.
//
// Bug: o form "Novo Usuário" e o handler suportam CPF (11 dígitos), mas o schema
// exigia cnpj com min(14) — um CPF cru (11 díg.) era barrado com "Dados inválidos"
// (400) antes de chegar no handler. Só um CPF FORMATADO (14 chars) passava.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8')

test('createUserSchema aceita CPF cru (11 díg.), não exige 14', () => {
  const i = admin.indexOf('const createUserSchema')
  assert.notEqual(i, -1)
  const s = admin.slice(i, i + 700)
  assert.ok(!/cnpj:\s*z\.string\(\)\.min\(14\)/.test(s),
    'o schema não pode exigir min(14) — barra CPF de 11 dígitos')
  assert.ok(/cnpj:\s*z\.string\(\)\.min\(11\)/.test(s),
    'o schema precisa aceitar a partir de 11 caracteres (CPF cru)')
})

test('o handler ainda valida o documento (11 ou 14 dígitos) de verdade', () => {
  const i = admin.indexOf("router.post('/users'")
  assert.notEqual(i, -1)
  const r = admin.slice(i, i + 1500)
  assert.ok(/digits\.length === 11 \? 'cpf' : digits\.length === 14 \? 'cnpj' : null/.test(r),
    'o handler continua conferindo CPF (11) ou CNPJ (14)')
  assert.ok(/validateBrDoc/.test(r), 'e valida o documento com validateBrDoc')
})
