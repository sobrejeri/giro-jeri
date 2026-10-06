// Link de redefinição de senha por WhatsApp (uso único).
//
// Fluxo: o admin clica "Enviar link por WhatsApp" → a API gera um token de
// reset carimbado com a VERSÃO de reset do usuário e manda pelo WhatsApp (ou
// devolve o link para o admin copiar). O próprio usuário abre o link no
// turista, digita a nova senha + confirmação, e a API troca a senha e
// INCREMENTA a versão — o que invalida aquele link (uso único). O reset manual
// do admin ("Confirmar Nova Senha") continua existindo. Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const admin      = read('../src/routes/admin.js')
const auth       = read('../src/routes/auth.js')
const resetToken = read('../src/lib/resetToken.js')
const adminApi   = read('../../admin/src/lib/api.js')
const usuarios   = read('../../admin/src/pages/Usuarios.jsx')
const resetPage  = read('../../turista/src/pages/ResetPassword.jsx')
const migration  = read('../../../supabase/migrations/122_password_reset_single_use.sql')

test('API: endpoint reset-link gera token com versão e devolve o link', () => {
  assert.match(admin, /router\.post\('\/users\/:id\/reset-link', requireAdmin/,
    'existe o endpoint POST /users/:id/reset-link protegido por admin')
  assert.match(admin, /signResetToken\(target\.id, target\.password_reset_version \?\? 0\)/,
    'o token é carimbado com a versão de reset vigente do usuário')
  assert.match(admin, /notifyPasswordReset\(target\.phone, token\)/,
    'tenta enviar por WhatsApp quando há telefone')
  assert.match(admin, /whatsapp_sent: whatsappSent, has_phone: !!target\.phone, link: linkPasswordReset\(token\)/,
    'devolve whatsapp_sent + has_phone + o link copiável')
})

test('token de reset carrega a claim de versão (uso único)', () => {
  assert.match(resetToken, /signResetToken\(userId, version = 0\)/, 'assina com versão')
  assert.match(resetToken, /v: version/, 'a claim v guarda a versão do usuário')
  assert.match(resetToken, /v: typeof claims\.v === 'number' \? claims\.v : null/,
    'token legado sem v volta null e pula a checagem')
})

test('reset-password valida a versão (410) e incrementa ao concluir', () => {
  assert.match(auth, /claims\.v != null && claims\.v !== \(profile\.password_reset_version \?\? 0\)/,
    'checa a versão do token contra a atual')
  assert.match(auth, /status\(410\)\.json\(\{ error: 'Este link já foi usado\. Peça um novo\.' \}\)/,
    'link já usado devolve 410')
  assert.match(auth, /password_reset_version: \(profile\.password_reset_version \?\? 0\) \+ 1/,
    'incrementa a versão após trocar a senha (invalida o link)')
})

test('forgot-password também carimba o token com a versão', () => {
  assert.match(auth, /signResetToken\(user\.id, user\.password_reset_version \?\? 0\)/,
    'o link do "esqueci a senha" é de uso único do mesmo jeito')
})

test('admin: helper e botão "Enviar link por WhatsApp"', () => {
  assert.match(adminApi, /sendUserResetLink: \(id\)\s+=> request\(`\/api\/admin\/users\/\$\{id\}\/reset-link`, \{ method: 'POST' \}\)/,
    'o helper da api chama o endpoint')
  assert.match(usuarios, /sendLinkMut\.mutate\(modal\.user\.id\)/, 'o botão dispara a geração do link')
  assert.match(usuarios, /Enviar link por WhatsApp/, 'o modal tem a seção do link por WhatsApp')
  assert.match(usuarios, /api\.sendUserResetLink\(id\)/, 'a mutation usa o helper')
  // o reset manual do admin continua existindo
  assert.match(usuarios, /Confirmar Nova Senha/, 'o reset manual pelo admin continua disponível')
})

test('turista: página de reset pede nova senha + confirmação', () => {
  assert.match(resetPage, /api\.resetPassword\(\{ token, new_password: pwd \}\)/, 'envia token + nova senha')
  assert.match(resetPage, /As senhas não coincidem\./, 'valida a confirmação (duas senhas iguais)')
  assert.match(resetPage, /Repita a nova senha/, 'tem o campo de confirmação')
})

test('migração 122 adiciona password_reset_version', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS password_reset_version INT NOT NULL DEFAULT 0/,
    'a coluna de versão de reset existe e é idempotente')
})
