// Operador vinculado a EMPRESA (migração 129) — a comissão vai para a empresa.
//
// O que estes testes seguram:
//  · a API sobe ANTES de o dono rodar a migração: nenhuma leitura do vínculo
//    pode derrubar pagamento, perfil ou a tela de usuários por coluna ausente;
//  · operador vinculado nunca recebe no ato (split) — senão a comissão sairia
//    duas vezes: uma pelo gateway para o operador, outra no repasse à empresa;
//  · a migração pode rodar mais de uma vez.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

process.env.SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste'
process.env.SUPABASE_ANON_KEY ||= 'chave-de-teste'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const { semVinculoNoBanco } = await import('../src/lib/vinculoEmpresa.js')

test('coluna ausente é reconhecida nos formatos do Postgres e do PostgREST', () => {
  assert.equal(semVinculoNoBanco({ code: '42703', message: 'column users.company_id does not exist' }), true)
  assert.equal(semVinculoNoBanco({ code: 'PGRST204', message: "Could not find the 'company_id' column of 'users' in the schema cache" }), true)
  assert.equal(semVinculoNoBanco({ code: 'PGRST200', message: "Could not find a relationship between 'booking_payouts' and 'users' using the hint 'booking_payouts_origin_operator_id_fkey'" }), true)
  // Outra coluna, ou outro erro, NÃO é "migração pendente": tem de subir.
  assert.equal(semVinculoNoBanco({ code: '42703', message: 'column users.region_ids does not exist' }), false)
  assert.equal(semVinculoNoBanco({ code: '57014', message: 'canceling statement due to statement timeout' }), false)
  assert.equal(semVinculoNoBanco(null), false)
})

test('nenhuma rota lê company_id junto com outras colunas (quebraria sem a migração)', () => {
  for (const arq of ['routes/payments.js', 'routes/operator.js', 'routes/mpOauth.js', 'routes/admin.js', 'middleware/independentReceiving.js']) {
    const src = ler(`../src/${arq}`)
    const selects = [...src.matchAll(/\.select\((`[^`]*`|'[^']*')/g)].map((m) => m[1])
    for (const s of selects.filter((x) => /company_id/.test(x))) {
      assert.match(s, /^['`]\s*company_id\s*['`]$/, `${arq}: company_id só em leitura isolada e tolerante — achei ${s}`)
    }
    assert.doesNotMatch(src, /\.is\('company_id'/, `${arq}: filtro por company_id fora do helper`)
  }
  const perfil = ler('../src/routes/operator.js')
  assert.doesNotMatch(perfil.slice(perfil.indexOf('const PROFILE_FIELDS'), perfil.indexOf('const PROFILE_FIELDS') + 400), /company_id/)
})

test('pagamento: vínculo passa pelo helper tolerante, e vinculado não divide no ato', () => {
  const pay = ler('../src/routes/payments.js')
  assert.match(pay, /const hasCompanyLinkedOperator = algumOperadorVinculado/)
  const pagarme = pay.slice(pay.indexOf('async function splitDoPagarme'), pay.indexOf('export function mediaPonderadaDoPercentual'))
  assert.match(pagarme, /if \(await algumOperadorVinculado\(\[operatorId\]\)\) \{\s*return \{ erro: 'operador vinculado a empresa/)
  const mpUnico = pay.slice(pay.indexOf('async function contextoSplitOperadorUnico'), pay.indexOf('async function contextoSplitOperadorUnico') + 900)
  assert.match(mpUnico, /if \(await hasCompanyLinkedOperator\(\[operatorId\]\)\) return null/)
  const legado = pay.slice(pay.indexOf('async function getSplitContext('), pay.indexOf('function allocateCents'))
  assert.match(legado, /if \(await hasCompanyLinkedOperator\(\[booking\?\.operator_id\]\)\) return null/)

  const helper = ler('../src/lib/vinculoEmpresa.js')
  assert.equal((helper.match(/if \(semVinculoNoBanco\(error\)\) return (null|false)\s*throw error/g) || []).length, 2,
    'coluna ausente = ninguém vinculado; qualquer outro erro sobe')
})

test('repasse: split já pago pelo gateway nunca gera comissão de novo (inclusive no carrinho)', () => {
  const src = ler('../src/services/payouts.js')
  assert.match(src, /\.eq\('status', 'approved'\)\s*\.eq\('split_operator_id', booking\.operator_id\)/)
  assert.match(src, /booking_id\.eq\.\$\{booking\.id\},order_group_id\.eq\.\$\{booking\.order_group_id\}/)
  assert.match(src, /if \(splitError && splitError\.code !== '42703'\) throw splitError/, 'na dúvida, não lança repasse')
})

test('painel da empresa: comissões só da própria empresa, e vazio (não erro) sem a migração', () => {
  const src = ler('../src/routes/company.js')
  assert.match(src, /router\.use\(authenticate, requireRole\('company'\)\)/)
  const rota = src.slice(src.indexOf("router.get('/commissions'"))
  assert.match(rota, /\.eq\('payee_user_id', req\.user\.id\)\s*\.eq\('kind', 'commission'\)/)
  assert.match(rota, /if \(semVinculoNoBanco\(error\)\) return res\.json\(\{ rows: \[\], pendente: true \}\)/)
})

test('admin: só operador é vinculado, só a empresa ativa, e aviso claro sem a migração', () => {
  const src = ler('../src/routes/admin.js')
  const patch = src.slice(src.indexOf("router.patch('/users/:id'"), src.indexOf("router.post('/users/:id/register-recipient'"))
  assert.match(patch, /if \(companyId && targetRole !== 'operator'\) return res\.status\(400\)/)
  assert.match(patch, /\.eq\('user_type', 'company'\)\.eq\('is_active', true\)/)
  assert.match(patch, /if \(updates\.company_id\) return res\.status\(409\)\.json\(\{ error: MSG_MIGRACAO_EMPRESA \}\)/)
  assert.match(patch, /delete updates\.company_id/, 'trocar tipo/status continua funcionando sem a migração')
  assert.match(patch, /error\?\.code === '23503'/, 'empresa com operadores não muda de tipo — com mensagem')
})

test('migração 129: re-executável e com as travas no banco', () => {
  const sql = ler('../../../supabase/migrations/129_empresa_vinculo_e_comissao.sql')
  assert.doesNotMatch(sql, /^CREATE (FUNCTION|INDEX (?!IF NOT EXISTS))/m)
  assert.doesNotMatch(sql, /ADD COLUMN (?!IF NOT EXISTS)/)
  assert.equal((sql.match(/DROP TRIGGER IF EXISTS/g) || []).length, 2)
  assert.equal((sql.match(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname/g) || []).length, 3)
  assert.match(sql, /CHECK \(company_id IS NULL OR user_type = 'operator'\)/)
  assert.match(sql, /NEW\.origin_operator_id := NEW\.payee_user_id;\s*NEW\.payee_user_id := linked_company;/)
  // Os rascunhos não-reexecutáveis saíram do repositório.
  const pasta = fs.readdirSync(new URL('../../../supabase/migrations/', import.meta.url))
  assert.deepEqual(pasta.filter((f) => /operator_company_link|company_commission_recipient/.test(f)), [])
})

test('painel do operador vinculado: sem conta própria, e o texto da empresa atualizado', () => {
  const perfil = ler('../../operador/src/pages/Perfil.jsx')
  assert.match(perfil, /profile\?\.company_id \? \(/)
  const empresa = ler('../../operador/src/pages/Empresa.jsx')
  assert.doesNotMatch(empresa, /ainda está em desenvolvimento/)
})
