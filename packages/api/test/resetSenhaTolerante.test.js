// Reset de senha robusto: funciona sem a migration 122 e destrava ex-Google.
//
// Dois problemas que travavam o "Gerar e enviar link" e o reset pelo link:
//  1) os endpoints liam password_reset_version (migration 122); sem a coluna, a
//     consulta falhava (42703) e caía em "usuário/conta não encontrada" — nenhum
//     link era gerado;
//  2) o reset pelo link gravava a senha via auth_id, que para conta ex-Google
//     está pendurado — então o link gerava mas não funcionava.
// Agora: tolerância à coluna ausente (versão 0) e resolução/criação do login
// pelo e-mail do perfil no reset por token. Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const admin = read('../src/routes/admin.js')
const auth  = read('../src/routes/auth.js')

// Recorta o handler do reset-link (admin) e do reset-password/forgot (auth).
const slice = (src, marker) => {
  const i = src.indexOf(marker)
  const fim = src.indexOf('\nrouter.', i + 10)
  return src.slice(i, fim === -1 ? src.length : fim)
}
const resetLink  = slice(admin, "router.post('/users/:id/reset-link'")
const resetPwd   = slice(auth,  "router.post('/reset-password'")
const forgot     = slice(auth,  "router.post('/forgot-password'")

test('reset-link tolera a migration 122 ausente (não 404 à toa)', () => {
  assert.match(resetLink, /full\.error\?\.code === '42703'/, 'faz fallback sem a coluna')
  assert.match(resetLink, /signResetToken\(target\.id, version\)/, 'assina com a versão resolvida (0 se não houver coluna)')
})

test('forgot-password lê a versão à parte, tolerante à coluna', () => {
  assert.doesNotMatch(forgot, /const SEL = '[^']*password_reset_version/, 'a busca principal não depende da coluna')
  assert.match(forgot, /select\('password_reset_version'\)\.eq\('id', user\.id\)/, 'versão lida à parte')
})

test('reset por token: tolera a coluna e destrava ex-Google (resolve/cria por e-mail)', () => {
  assert.match(resetPwd, /hasVersionCol/, 'trata a ausência da coluna')
  assert.match(resetPwd, /String\(u\.email \|\| ''\)\.toLowerCase\(\) === profileEmail/, 'resolve a conta de auth pelo e-mail do perfil')
  assert.match(resetPwd, /auth\.admin\.createUser\(\{\s*email: profileEmail, password: new_password, email_confirm: true/,
    'cria o login por e-mail+senha quando não existe (ex-Google)')
  assert.match(resetPwd, /if \(hasVersionCol\) \{[\s\S]*?password_reset_version: \(profile\.password_reset_version \?\? 0\) \+ 1/,
    'só incrementa a versão (uso único) quando a coluna existe')
})
