// Desempenho da equipe da empresa: o que soma no "vendido" e de quem.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { montarDesempenho } from '../src/services/desempenhoEquipe.js'

const equipe = [
  { id: 'op1', full_name: 'Lagoa Tours', is_active: true, removed_at: null },
  { id: 'op2', full_name: 'Carlos Buggy', is_active: false, removed_at: '2026-10-01T00:00:00Z' },
  { id: 'op3', full_name: 'Sem Vendas', is_active: true, removed_at: null },
  { id: 'op4', full_name: 'Removido Parado', is_active: false, removed_at: '2026-09-01T00:00:00Z' },
]
const reserva = (x) => ({ booking_code: 'TRV-1', service_type: 'tour', service_date: '2026-11-10', people_count: 2, operational_assignments: [], booking_payouts: [], ...x })
const reservas = [
  reserva({ id: 'b1', operator_id: 'op1', total_amount: 300, status_commercial: 'paid', service_date: '2026-11-12',
    operational_assignments: [{ driver_name: 'Zé Bugueiro' }],
    booking_payouts: [{ kind: 'commission', payee_user_id: 'co', amount: 255, status: 'pending' }, { kind: 'execution', payee_user_id: 'x', amount: 30, status: 'pending' }] }),
  reserva({ id: 'b2', operator_id: 'op1', total_amount: 200, status_commercial: 'awaiting_payment' }),
  reserva({ id: 'b3', operator_id: 'op1', total_amount: 150, status_commercial: 'cancelled' }),
  reserva({ id: 'b4', operator_id: 'op1', total_amount: 999, status_commercial: 'draft' }),
  // paga ANTES do vínculo: comissão no nome do operador, não da empresa
  reserva({ id: 'b5', operator_id: 'op2', total_amount: 100, status_commercial: 'paid',
    booking_payouts: [{ kind: 'commission', payee_user_id: 'op2', amount: 85, status: 'paid' }] }),
  reserva({ id: 'b6', operator_id: 'op1', total_amount: 80, status_commercial: 'paid',
    booking_payouts: [{ kind: 'commission', payee_user_id: 'co', amount: 68, status: 'cancelled' }] }),
]
const externas = [
  { id: 'e1', operator_id: 'op1', customer_name: 'Ana', service_type: 'tour', service_description: 'Buggy Litoral Leste', service_date: '2026-11-11', people_count: 4, total_amount: 450.5, executor_name: 'João', status: 'active' },
  { id: 'e2', operator_id: 'op1', customer_name: 'Rui', service_type: 'transfer', service_description: 'Jeri → Fortaleza', service_date: '2026-11-09', people_count: 2, total_amount: 700, status: 'cancelled' },
]
const r = montarDesempenho({ reservas, externas, equipe, companyId: 'co' })

test('só reserva PAGA e externa ATIVA somam no vendido', () => {
  assert.deepEqual(r.total, { reservas: 3, externas: 1, vendido_plataforma: 480, vendido_externo: 450.5, comissao: 255 })
})

test('comissão é só a da empresa: ignora a do operador (antes do vínculo), a de execução e a cancelada', () => {
  const linha = (id) => r.rows.find((x) => x.id === id)
  assert.equal(linha('b1').comissao, 255)
  assert.equal(linha('b5').comissao, null)
  assert.equal(linha('b6').comissao, null)
  assert.equal(linha('e1').comissao, null, 'venda externa nunca gera comissão')
})

test('quem vendeu e quem executou', () => {
  const b1 = r.rows.find((x) => x.id === 'b1')
  assert.equal(b1.vendedor, 'Lagoa Tours'); assert.equal(b1.executor, 'Zé Bugueiro')
  const e1 = r.rows.find((x) => x.id === 'e1')
  assert.equal(e1.origem, 'externa'); assert.equal(e1.executor, 'João'); assert.equal(e1.cliente, 'Ana')
  assert.equal(r.rows.find((x) => x.id === 'b2').executor, null)
})

test('lista: rascunho fica de fora, não pagas e canceladas aparecem, mais recentes primeiro', () => {
  assert.deepEqual(r.rows.map((x) => x.id), ['b1', 'e1', 'b2', 'b3', 'b5', 'b6', 'e2'])
  assert.equal(r.rows.find((x) => x.id === 'b3').conta, false)
})

test('por operador: ordenado pelo vendido; removido só aparece se vendeu no período', () => {
  assert.deepEqual(r.operadores.map((o) => o.nome), ['Lagoa Tours', 'Carlos Buggy', 'Sem Vendas'])
  const lagoa = r.operadores[0]
  assert.equal(lagoa.vendido_plataforma, 380); assert.equal(lagoa.vendido_externo, 450.5); assert.equal(lagoa.comissao, 255)
  assert.equal(r.operadores[1].removido, true)
})

test('rotas: a empresa só lê a própria equipe; o operador só mexe nas próprias vendas externas', () => {
  const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
  const emp = ler('../src/routes/companyBookings.js')
  assert.match(emp, /\.eq\('company_id', req\.user\.id\)\.eq\('user_type', 'operator'\)/)
  assert.match(emp, /\.from\('external_bookings'\)[\s\S]{0,120}\.eq\('company_id', req\.user\.id\)/)
  assert.match(emp, /\.in\('operator_id', ids\)/)
  assert.doesNotMatch(emp, /req\.(query|body)\.company_id/)
  const ext = ler('../src/routes/externalBookings.js')
  assert.match(ext, /\.eq\('id', req\.params\.id\)\.eq\('operator_id', req\.user\.id\)/)
  assert.match(ext, /const company_id = await empresaDoOperador\(req\.user\.id\)/, 'a empresa da venda vem do servidor')
  assert.match(ext, /z\.object\(base\)\.strict\(\)/, 'o corpo não aceita operator_id nem company_id')
  const sql = ler('../../../supabase/migrations/131_reservas_externas.sql')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.external_bookings/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
})
