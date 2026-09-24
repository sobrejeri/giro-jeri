// Perfil do operador: e-mail editável (com sincronia de login) e chave PIX.
//
// - O e-mail é a CREDENCIAL de login (o operador entra por documento/usuário, mas
//   o servidor autentica em users.email no Supabase). Editar users.email sem
//   trocar no Supabase Auth quebraria o próximo login — o PATCH sincroniza os dois.
// - A chave PIX volta ao perfil para o repasse manual; o admin já a vê na Fila.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const operador = fs.readFileSync(new URL('../src/routes/operator.js', import.meta.url), 'utf8')

test('profileSchema aceita email', () => {
  const i = operador.indexOf('const profileSchema')
  const s = operador.slice(i, i + 500)
  assert.ok(/email:\s*z\.string\(\)\.email\(\)/.test(s), 'email precisa ser aceito no schema do perfil')
})

test('PATCH /profile sincroniza o e-mail com o Supabase Auth ao mudar', () => {
  const i = operador.indexOf("router.patch('/profile'")
  const r = operador.slice(i, i + 3000).replace(/\s+/g, ' ')
  assert.ok(/auth\.admin\s*\.updateUserById\([^)]*email/.test(r) || /updateUserById\(atual\.auth_id, \{ email/.test(r),
    'ao trocar o e-mail, o Supabase Auth precisa ser atualizado junto (senão o login quebra)')
  assert.ok(/email_confirm: true/.test(r), 'define o e-mail sem exigir novo fluxo de confirmação')
})

test('PROFILE_FIELDS traz email e pix (perfil carrega e reflete)', () => {
  const i = operador.indexOf('const PROFILE_FIELDS')
  const s = operador.slice(i, i + 200)
  assert.ok(/email/.test(s), 'perfil precisa retornar email')
  assert.ok(/pix_key/.test(s), 'perfil precisa retornar a chave PIX')
})
