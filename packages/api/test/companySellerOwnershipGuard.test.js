// Regressao de integridade: comissao da equipe deve pertencer a empresa
// vinculada ao operador e a reserva que ele vendeu.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(
  new URL('../../../supabase/migrations/137_integridade_comissao_vendedor_empresa.sql', import.meta.url), 'utf8')
const servico = fs.readFileSync(
  new URL('../src/services/comissaoVendedor.js', import.meta.url), 'utf8')

test('trigger valida empresa, vendedor e reserva na criacao da comissao', () => {
  assert.match(sql, /NEW\.operator_id/)
  assert.match(sql, /u\.company_id = NEW\.company_id/)
  assert.match(sql, /u\.user_type = 'operator'/)
  assert.match(sql, /b\.id = NEW\.booking_id/)
  assert.match(sql, /b\.operator_id = NEW\.operator_id/)
  assert.match(sql, /BEFORE INSERT OR UPDATE OF company_id, operator_id, booking_id/)
})

test('chaves de origem da comissao nao podem ser trocadas apos criacao', () => {
  assert.match(sql, /ROW\(NEW\.company_id, NEW\.operator_id, NEW\.booking_id\)/)
  assert.match(sql, /IS DISTINCT FROM ROW\(OLD\.company_id, OLD\.operator_id, OLD\.booking_id\)/)
  assert.match(sql, /ERRCODE = '23514'/)
})

test('trigger nao altera valores, status nem pagamentos existentes', () => {
  assert.doesNotMatch(sql, /UPDATE\s+public\.company_seller_payouts\s+SET/i)
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.company_seller_payouts/i)
  assert.doesNotMatch(sql, /SECURITY\s+DEFINER/i)
  assert.match(servico, /company_id: companyId, operator_id: b\.operator_id/)
})

test('funcao interna de seguranca nao vira RPC publica', () => {
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.enforce_company_seller_payout_ownership\(\)/)
  assert.match(sql, /FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /TO service_role/)
  assert.match(sql, /SET search_path = ''/)
})
