// Reset de senha pelo admin: destrava turista que veio do Google.
//
// Quando o login via Google foi removido, quem se cadastrou por ele ficou sem
// senha — e, sem o botão do Google, sem conseguir entrar. O "Redefinir senha"
// do admin confiava no auth_id do perfil; para esses casos ele precisa RESOLVER
// a conta de auth pelo e-mail do PERFIL e CRIAR o login se não existir (igual já
// faz pro operador pelo documento). Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const admin = read('../src/routes/admin.js')

// Recorta só o handler do reset-password (até o próximo router).
const i = admin.indexOf("router.post('/users/:id/reset-password'")
const fim = admin.indexOf('\nrouter.', i + 10)
const reset = admin.slice(i, fim === -1 ? admin.length : fim)

test('o reset lê o e-mail do perfil (não só o auth_id)', () => {
  assert.match(reset, /select\('auth_id, email, full_name, user_type, document_number'\)/,
    'passa a trazer o e-mail do perfil')
  assert.match(reset, /if \(!target\) return res\.status\(404\)/,
    'não aborta só porque falta auth_id — turista pode ser resolvido por e-mail')
})

test('turista/admin: resolve a conta de auth pelo e-mail do perfil', () => {
  assert.match(reset, /const profileEmail = String\(target\.email \|\| ''\)\.trim\(\)\.toLowerCase\(\)/,
    'normaliza o e-mail do perfil')
  assert.match(reset, /String\(u\.email \|\| ''\)\.toLowerCase\(\) === profileEmail/,
    'procura o usuário de auth com esse e-mail')
  assert.match(reset, /if \(authUser\) \{\s*authId = authUser\.id;/, 'achou a conta pelo e-mail → usa ela')
  assert.match(reset, /if \(authId && target\.auth_id !== authId\) \{\s*await supabase\.from\('users'\)\.update\(\{ auth_id: authId \}\)/,
    'repara o vínculo auth_id quando acha')
})

test('cria o login por e-mail+senha quando não existe (caso ex-Google)', () => {
  assert.match(reset, /auth\.admin\.createUser\(\{\s*email: profileEmail, password: new_password, email_confirm: true/,
    'cria a conta de auth com o e-mail do perfil e já confirma')
  assert.match(reset, /update\(\{ auth_id: authId \}\)/, 'vincula o novo auth ao perfil')
})

test('o caminho do operador (login por documento) continua intacto', () => {
  assert.match(reset, /user_type === 'operator' && docDigits/, 'operador ainda resolve por documento')
  assert.match(reset, /\$\{docDigits\}@op\.girojeri\.app/, 'operador ainda usa o e-mail sintético')
})
