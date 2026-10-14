// Página de redefinição identifica PARA QUEM é a senha.
//
// A página só dizia "Crie uma nova senha para sua conta", sem mostrar quem é —
// dava pra atualizar a conta errada sem perceber. Agora um endpoint devolve
// nome + @ + e-mail MASCARADO a partir do token, e a página exibe isso acima do
// formulário. Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const auth  = read('../src/routes/auth.js')
const tApi  = read('../../turista/src/lib/api.js')
const page  = read('../../turista/src/pages/ResetPassword.jsx')

test('endpoint reset-info valida o token e devolve dados não sensíveis', () => {
  assert.match(auth, /router\.post\('\/reset-info'/, 'existe o endpoint')
  assert.match(auth, /claims = verifyResetToken\(token\)/, 'valida o token (mesma regra do reset)')
  assert.match(auth, /email:\s*profile\.email \? maskDestination\('email', profile\.email\) : null/,
    'o e-mail vai MASCARADO, nunca cru')
  assert.match(auth, /name:\s*profile\.full_name \|\| null/, 'devolve o nome')
  assert.match(auth, /photo:\s*profile\.profile_photo_url \|\| null/, 'devolve a foto do perfil')
})

test('turista: helper resetInfo e endpoint tratado como público', () => {
  assert.match(tApi, /resetInfo:\s*\(token\) => request\('\/api\/auth\/reset-info'/, 'helper da api')
  assert.match(tApi, /path\.startsWith\('\/api\/auth\/reset-info'\)/, 'não redireciona pro login (é público)')
})

test('a página busca e mostra a conta identificada', () => {
  assert.match(page, /api\.resetInfo\(token\)/, 'busca a identificação pelo token')
  assert.match(page, /info\.name \|\| \(info\.username \? `@\$\{info\.username\}`/, 'mostra o nome/@ da conta')
  assert.match(page, /info\.email/, 'mostra o e-mail mascarado')
  assert.match(page, /info\.photo\s*\?\s*<img/, 'mostra a foto do perfil (com inicial como fallback)')
})
