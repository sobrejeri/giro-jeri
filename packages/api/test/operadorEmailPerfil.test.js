// E-mail do operador: perfil separado do login.
//
// O operador loga PELO DOCUMENTO (e-mail sintético <doc>@op.girojeri.app,
// reconstruído no login). O e-mail do PERFIL (users.email) deixa de ser o
// sintético: fica em branco ou recebe o e-mail real informado pelo admin na
// criação. Este teste trava esse desacoplamento para o login não voltar a
// depender do e-mail do perfil (o que quebraria o acesso se o operador trocar
// o e-mail). Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const admin   = read('../src/routes/admin.js')
const auth    = read('../src/routes/auth.js')
const usuarios = read('../../admin/src/pages/Usuarios.jsx')
const migration = read('../../../supabase/migrations/120_operador_email_opcional.sql')

test('criar operador: login sintético, perfil em branco ou e-mail real', () => {
  assert.match(admin, /authEmail = `\$\{digits\}@op\.girojeri\.app`/, 'login do operador é o e-mail sintético')
  assert.match(admin, /profileEmail = \(body\.email && body\.email\.trim\(\)\) \|\| null/,
    'o perfil recebe o e-mail informado, ou fica nulo')
  assert.match(admin, /email:\s+profileEmail,/, 'users.email usa o e-mail do perfil, não o de login')
})

test('login do operador reconstrói o e-mail sintético pelo documento', () => {
  assert.match(auth, /authEmail = opUser\.user_type === 'operator'\s*\n\s*\? `\$\{docDigits\}@op\.girojeri\.app`\s*\n\s*: opUser\.email/,
    'operador autentica pelo documento; o e-mail do perfil não afeta o login')
})

test('o admin pode informar o e-mail do operador na criação', () => {
  assert.match(usuarios, /\? \{ cnpj: createForm\.cnpj, \.\.\.\(createForm\.email \? \{ email: createForm\.email \} : \{\}\) \}/,
    'o form envia o e-mail do operador quando informado')
  assert.match(usuarios, /E-mail do operador \(opcional\)/, 'o form tem o campo de e-mail do operador')
})

test('a migração 120 relaxa o CHECK para aceitar operador só com documento', () => {
  assert.match(migration, /document_number IS NOT NULL/, 'operador só com documento passa a ser válido')
})
