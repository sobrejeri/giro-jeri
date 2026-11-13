// Equipe da EMPRESA — a empresa cria, edita, bloqueia e remove os próprios
// operadores, preservando o histórico.
//
// O que estes testes seguram:
//  · isolamento: a empresa só mexe em operador cujo company_id é o DELA, e o
//    vínculo de quem ela cria vem da sessão — nunca do corpo da requisição;
//  · a empresa não muda tipo, percentual nem conta de recebimento do operador;
//  · remover não apaga nada.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const rotas = ler('../src/routes/companyTeam.js')
const company = ler('../src/routes/company.js')
const trecho = (ini, fim) => rotas.slice(rotas.indexOf(ini), fim ? rotas.indexOf(fim) : undefined)

test('as rotas da equipe ficam atrás do login de empresa', () => {
  const guarda = company.indexOf('router.use(empresaAlvo)')
  const monta = company.indexOf('router.use(companyTeam)')
  assert.ok(guarda !== -1 && monta > guarda, 'a equipe é montada DEPOIS da trava de empresa (e da escolha da empresa pelo admin)')
  assert.doesNotMatch(rotas, /requireAdmin|requireOperator/)
})

test('isolamento: todo acesso a um operador confere o company_id da empresa logada', () => {
  const guarda = trecho('async function operadorDaEquipe', 'const publico')
  assert.match(guarda, /\.eq\('id', operatorId\)\.eq\('company_id', companyId\)\.eq\('user_type', 'operator'\)/)
  for (const rota of ["router.patch('/team/:id'", "router.post('/team/:id/password'", "router.delete('/team/:id'"]) {
    const corpo = rotas.slice(rotas.indexOf(rota), rotas.indexOf('} catch (err)', rotas.indexOf(rota)))
    assert.match(corpo, /await operadorDaEquipe\(req\.user\.id, req\.params\.id\)/, `${rota} confere a equipe`)
  }
  // Os UPDATEs repetem o filtro (defesa em profundidade contra corrida).
  assert.equal((rotas.match(/\.eq\('id', op\.id\)\.eq\('company_id', req\.user\.id\)/g) || []).length, 2)
  const lista = trecho("router.get('/team'", '// ── POST /team')
  assert.match(lista, /\.eq\('company_id', req\.user\.id\)\.eq\('user_type', 'operator'\)/)
})

test('criar: o vínculo vem da sessão e o corpo não aceita campos a mais', () => {
  const criar = trecho('const criarSchema', '// ── PATCH /team/:id')
  assert.match(criar, /\}\)\.strict\(\);/, 'company_id, user_type etc. no corpo são recusados')
  assert.doesNotMatch(criar.slice(0, criar.indexOf('router.post')), /company_id|user_type|platform_split_pct|is_active/)
  assert.match(criar, /company_id: req\.user\.id,/)
  assert.match(criar, /user_type: 'operator'/)
  assert.match(criar, /validateBrDoc\(tipo, digits\)/, 'CPF/CNPJ validado de verdade')
  assert.match(criar, /await supabase\.auth\.admin\.deleteUser\(authData\.user\.id\)/, 'sem perfil, não sobra login órfão')
  // Confere a coluna do vínculo ANTES de criar o login.
  assert.ok(criar.indexOf("select('company_id').eq('id', req.user.id)") < criar.indexOf('auth.admin.createUser'))
})

test('editar: só dados de contato, municípios e bloqueio', () => {
  const editar = trecho('const editarSchema', "router.patch('/team/:id'")
  const campos = [...editar.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
  assert.deepEqual(campos, ['full_name', 'email', 'phone', 'region_ids', 'is_active'])
  assert.match(editar, /\.partial\(\)\.strict\(\)/)
  assert.doesNotMatch(rotas, /pix_key|bank_|gateway_recipient_id|platform_split_pct/, 'recebimento e percentual não são da empresa')
})

test('remover preserva o histórico: bloqueia e marca, sem apagar nem desvincular', () => {
  const remover = trecho("router.delete('/team/:id'", 'export default')
  assert.match(remover, /\.update\(\{ is_active: false, company_removed_at: agora, updated_at: agora \}\)/)
  assert.doesNotMatch(rotas, /\.delete\(\)/, 'nenhuma linha de usuário é apagada')
  assert.doesNotMatch(remover, /company_id: null/, 'o vínculo fica — é ele que mantém o histórico com a empresa')
  assert.match(remover, /migração 130/, 'sem a coluna, avisa em vez de remover pela metade')
})

test('senha: nunca vai para o log de auditoria', () => {
  const senha = trecho("router.post('/team/:id/password'", '// ── DELETE /team/:id')
  assert.match(senha, /auditar\(req, op\.id, 'update', \{ password_reset: true \}\)/)
  assert.doesNotMatch(senha, /auditar\([^)]*new_password/)
})

test('migração 130 re-executável; admin que revincula tira a marca de removido', () => {
  const sql = ler('../../../supabase/migrations/130_empresa_equipe.sql')
  assert.match(sql, /ADD COLUMN IF NOT EXISTS company_removed_at timestamptz/)
  const admin = ler('../src/routes/admin.js')
  assert.match(admin, /if \(!upd\.error && updates\.company_id\) \{\s*await supabase\.from\('users'\)\.update\(\{ company_removed_at: null \}\)/)
})

test('tela: abas da empresa e remoção com confirmação explicando o que acontece', () => {
  const shell = ler('../../operador/src/pages/Empresa.jsx')
  for (const aba of ['Equipe', 'Comissões', 'Conta']) assert.match(shell, new RegExp(`rotulo: '${aba}'`))
  const tela = ler('../../operador/src/pages/empresa/Equipe.jsx')
  assert.match(tela, /As reservas e comissões dele continuam no histórico da empresa\./)
  assert.match(tela, /Sem município — não recebe solicitações/)
})

test('admin opera o painel de uma empresa: escolhe qual, e a auditoria registra o admin', () => {
  assert.match(company, /router\.use\(authenticate, requireRole\('company', 'admin'\)\)/)
  const alvo = company.slice(company.indexOf('async function empresaAlvo'), company.indexOf('router.use(empresaAlvo)'))
  assert.match(alvo, /if \(req\.user\.user_type !== 'admin'\) return next\(\)/, 'empresa logada nunca troca de empresa pelo cabeçalho')
  assert.match(alvo, /\.eq\('id', id\)\.eq\('user_type', 'company'\)/, 'o alvo tem de SER uma empresa')
  assert.match(alvo, /req\.actorId = req\.user\.id;\s*req\.user = \{ \.\.\.req\.user, id: empresa\.id, user_type: 'company'/)
  const lista = company.slice(company.indexOf("router.get('/companies'"), company.indexOf('async function empresaAlvo'))
  assert.match(lista, /if \(req\.user\.user_type !== 'admin'\) return res\.status\(403\)/, 'empresa não lista as outras')
  assert.match(rotas, /user_id: req\.actorId \|\| req\.user\.id/)
  const cliente = ler('../../operador/src/lib/api.js')
  assert.match(cliente, /empresaDoAdmin && path\.startsWith\('\/api\/company\/'\) \? \{ 'X-Company-Id': empresaDoAdmin \}/)
  const menu = ler('../../operador/src/components/layout/Sidebar.jsx')
  assert.match(menu, /\['tours', 'Passeios'\], \['parking', 'Estacionamento'\], \['company', 'Empresa'\]/)
})
