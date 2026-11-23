// Regressao do login operador/empresa: nao retornar JWT para perfil suspenso.
// E testes puros, sem usuarios Auth nem requisicoes ao gateway.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { perfilAtivoParaLogin } from '../src/lib/loginAccess.js'

const auth = fs.readFileSync(new URL('../src/routes/auth.js', import.meta.url), 'utf8')
const middleware = fs.readFileSync(new URL('../src/middleware/auth.js', import.meta.url), 'utf8')

test('empresa e operador ATIVOS podem receber sessao apos validacao da senha', () => {
  for (const tipo of ['company', 'operator', 'admin', 'tourist']) {
    assert.equal(perfilAtivoParaLogin({ user_type: tipo, is_active: true }), true, tipo)
  }
})

test('operador removido, empresa suspensa e perfil sem status nao podem receber token', () => {
  for (const perfil of [
    { user_type: 'operator', is_active: false },
    { user_type: 'company', is_active: false },
    { user_type: 'admin', is_active: null },
    { user_type: 'operator' },
    null,
    undefined,
  ]) {
    assert.equal(perfilAtivoParaLogin(perfil), false)
  }
})

test('todos os caminhos de busca do perfil incluem is_active', () => {
  assert.match(auth, /const PROFILE_COLS = '[^']*is_active'/)
  const selecoes = [...auth.matchAll(/\.select\(\`\$\{PROFILE_COLS\}[^\`]*\`\)/g)]
  assert.ok(selecoes.length >= 3, 'documento, auth_id e email devem ler STATUS do perfil')
})

test('POST login verifica o perfil ANTES de expor token ou iniciar verificacao', () => {
  const bloco = auth.slice(auth.indexOf("router.post('/login'"), auth.indexOf("router.get('/me'"))
  const i = bloco.indexOf('if (!perfilAtivoParaLogin(profile))')
  const verifica = bloco.indexOf("if (profile.user_type === 'tourist')")
  const exporToken = bloco.indexOf('token:         data.session.access_token')
  assert.ok(i > 0 && verifica > i && exporToken > i)
  assert.match(bloco.slice(i, verifica), /status\(403\)\.json\(\{ error: 'Conta suspensa ou inativa' \}\)/)
  assert.match(middleware, /if \(!profile\.is_active\)/, 'middleware de outras rotas continua bloqueando a conta')
})

test('perfil inexistente nao expõe email, documento ou auth_id na resposta', () => {
  const inicio = auth.indexOf("if (!profile) {", auth.indexOf("router.post('/login'"))
  const bloco = auth.slice(inicio, auth.indexOf('// Supabase Auth valida', inicio))
  assert.match(bloco, /res\.status\(401\)\.json\(\{ error: 'Perfil não encontrado\. Entre em contato com a Turiva\.' \}\)/)
  assert.doesNotMatch(bloco, /auth_email:|used_email:|used_cnpj:|data\.user\.email/)
  assert.doesNotMatch(bloco, /\`Perfil não encontrado \(/)
})
