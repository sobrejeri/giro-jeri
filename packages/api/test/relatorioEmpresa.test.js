// Relatório da empresa por período: contabilidade por operador e por executor.
import test from 'node:test'
import assert from 'node:assert/strict'
import { montarRelatorio, abasDoRelatorio } from '../../operador/src/lib/relatorioEmpresa.js'

const desempenho = {
  total: { comissao: 1173 },
  operadores: [{ operator_id: 'o2', nome: 'Lagoa Tours' }, { operator_id: 'o7', nome: 'Maria Guia' }, { operator_id: 'o9', nome: 'Sem Venda' }],
  rows: [
    { id: 'b1', origem: 'plataforma', codigo: 'TRV-1', servico: 'Litoral Leste', service_date: '2026-11-15', valor: 480, vendedor_id: 'o2', vendedor: 'Lagoa Tours', executor: 'Zé Bugueiro', conta: true, comissao: 408 },
    { id: 'b2', origem: 'plataforma', codigo: 'TRV-2', servico: 'Jeri → Fortaleza', service_date: '2026-11-12', valor: 900, vendedor_id: 'o2', vendedor: 'Lagoa Tours', executor: 'Paulo Hilux', conta: true, comissao: 765 },
    { id: 'b3', origem: 'plataforma', codigo: 'TRV-3', servico: 'Lagoa', service_date: '2026-11-18', valor: 260, vendedor_id: 'o7', vendedor: 'Maria Guia', executor: null, conta: false, comissao: null },
    { id: 'e1', origem: 'externa', codigo: null, servico: 'Cavalgada', service_date: '2026-11-09', valor: 360.5, vendedor_id: 'o7', vendedor: 'Maria Guia', executor: 'Haras', conta: true, comissao: null },
  ],
}
const L = (x) => ({ driver_payout_status: 'pending', executor_role: 'driver', ...x })
const executores = { rows: [
  L({ executor: 'Zé Bugueiro', driver_payout_amount: 180, driver_payout_status: 'paid', booking_code: 'TRV-1', service_date: '2026-11-15', driver_paid_at: '2026-11-16T10:00:00Z' }),
  L({ executor: 'zé  bugueiro ', driver_payout_amount: 120 }),                    // mesmo executor, digitado diferente
  L({ executor: 'Zé Bugueiro', driver_payout_amount: null }),                      // sem valor definido
  L({ executor: 'Cmte. Rocha', executor_role: 'pilot', driver_payout_amount: 900 }),
  L({ executor: 'Paulo Hilux', driver_payout_amount: 250, driver_payout_status: 'cancelled' }),  // não é devido
] }
const vendedores = { rows: [
  L({ executor: 'Lagoa Tours', operador_id: 'o2', executor_role: 'seller', driver_payout_amount: 48, driver_payout_status: 'paid' }),
  L({ executor: 'Lagoa Tours', operador_id: 'o2', executor_role: 'seller', driver_payout_amount: 90 }),
  L({ executor: 'Lagoa Tours', operador_id: 'o2', executor_role: 'seller', driver_payout_amount: 30, driver_payout_status: 'cancelled' }),
] }
const rel = montarRelatorio({ desempenho, executores, vendedores })

test('por operador: vendas pagas + externas ativas, e a comissão dele separada em paga e a pagar', () => {
  assert.deepEqual(rel.operadores.map((o) => o.nome), ['Lagoa Tours', 'Maria Guia'], 'quem não vendeu nem tem comissão fica de fora')
  const lagoa = rel.operadores[0]
  assert.deepEqual([lagoa.reservas, lagoa.vendido_plataforma, lagoa.externas, lagoa.vendido_total], [2, 1380, 0, 1380])
  assert.deepEqual([lagoa.comissao_devida, lagoa.comissao_paga, lagoa.comissao_pendente], [138, 48, 90], 'cancelada não entra')
  const maria = rel.operadores[1]
  assert.deepEqual([maria.reservas, maria.externas, maria.vendido_externo, maria.vendido_total], [0, 1, 360.5, 360.5], 'reserva não paga não soma')
})

test('por executor: junta o mesmo nome digitado diferente, separa por função e conta os sem valor', () => {
  assert.deepEqual(rel.executores.map((e) => [e.nome, e.papel]), [['Cmte. Rocha', 'Piloto'], ['Zé Bugueiro', 'Motorista']])
  const ze = rel.executores[1]
  assert.deepEqual([ze.servicos, ze.repasse_devido, ze.repasse_pago, ze.repasse_pendente, ze.sem_valor], [3, 300, 180, 120, 1])
})

test('totais fecham com as linhas', () => {
  const t = rel.totais
  assert.equal(t.vendido_total, 1740.5); assert.equal(t.vendido_plataforma, 1380); assert.equal(t.vendido_externo, 360.5)
  assert.equal(t.comissao_plataforma, 1173)
  assert.equal(t.repasse_devido, 1200); assert.equal(t.repasse_pago, 180); assert.equal(t.repasse_pendente, 1020)
  assert.equal(t.ja_pago, 228); assert.equal(t.a_pagar, 1110); assert.equal(t.sem_valor, 1)
  assert.equal(t.vendido_total, rel.operadores.reduce((s, o) => s + o.vendido_total, 0))
})

test('período vazio não quebra', () => {
  const v = montarRelatorio({})
  assert.deepEqual(v.operadores, []); assert.deepEqual(v.executores, []); assert.equal(v.totais.a_pagar, 0)
})

test('planilha: cinco abas, com linha de total e valores como número', () => {
  const abas = abasDoRelatorio(rel, { empresa: 'TURIVA QA', from: '2026-11-01', to: '2026-11-30' })
  assert.deepEqual(abas.map((a) => a.nome), ['Resumo', 'Operadores', 'Executores', 'Vendas', 'Repasses'])
  assert.match(abas[0].linhas[2][0], /01\/11\/2026 a 30\/11\/2026/)
  const ops = abas[1].linhas
  assert.equal(ops.length, 1 + 2 + 1)
  assert.deepEqual(ops[1][5], { v: 1380, tipo: 'n', estilo: 2 }, 'dinheiro vai como número, para somar no Excel')
  assert.equal(ops.at(-1)[5].v, 1740.5)
  assert.equal(abas[3].linhas.length, 1 + 3, 'só as vendas que contam')
  assert.equal(abas[4].linhas.length, 1 + 2 + 4, 'repasses cancelados ficam de fora')
})
