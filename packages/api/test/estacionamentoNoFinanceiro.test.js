// Estacionamento entra na contabilização geral (Dashboard + Financeiro).
//
// O estacionamento é um modelo INVERSO ao do passeio: o dono do lote fica com o
// bruto e a RECEITA DA PLATAFORMA é a comissão; o "repasse" é o líquido do
// parceiro (bruto − comissão). Os painéis liam só bookings/financial_ledger e
// ignoravam o estacionamento. Este teste trava a agregação (helper + os 3
// endpoints) para o estacionamento não sumir das contas de novo. Asserção de
// fonte, no estilo dos demais testes.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const helper = read('../src/services/parking/financial.js')
const admin  = read('../src/routes/admin.js')

test('o helper soma só reserva PAGA e calcula comissão/líquido certos', () => {
  assert.match(helper, /export async function parkingFinanceiro/)
  assert.match(helper, /export async function parkingFaturamentoDiario/)
  assert.match(helper, /\.eq\('payment_status', 'paid'\)/, 'só conta reserva paga')
  assert.match(helper, /comissaoC \+= Math\.round\(b \* Number\(r\.commission_pct \|\| 0\) \/ 100\)/,
    'comissão = bruto × commission_pct da reserva')
  assert.match(helper, /liquidoC: brutoC - comissaoC/, 'repasse do parceiro = bruto − comissão')
})

test('Dashboard (/stats) soma o estacionamento à receita bruta e líquida', () => {
  assert.match(admin, /parkingFinanceiro\(\{ from: today \}\)/)
  assert.match(admin, /valorBrutoHoje \+= pkHoje\.brutoC \/ 100/)
  assert.match(admin, /valorLiquidoHoje = \(valorLiquidoHoje \|\| 0\) \+ pkHoje\.comissaoC \/ 100/)
})

test('gráfico diário (/financial-daily) inclui o estacionamento', () => {
  assert.match(admin, /parkingFaturamentoDiario\(\{ since \}\)/)
  assert.match(admin, /byDay\[d\]\.total \+= v\.brutoC \/ 100/)
})

test('Financeiro (/financial): bruto += vaga, repasse += líquido, resultado += comissão', () => {
  assert.match(admin, /const brutoTotal\s+= round2\(bruto \+ parkBruto\)/)
  assert.match(admin, /const comissoesTotal = round2\(comissoes \+ parkComissao\)/)
  assert.match(admin, /const repassesTotal\s+= round2\(repassesOut \+ parkLiquido\)/)
  assert.match(admin, /const resultado = round2\(comissoesTotal - taxas - comissoesAfiliados\)/,
    'o resultado cresce pela comissão do estacionamento')
  // A resposta usa os totais com estacionamento, não só os de passeio.
  assert.match(admin, /bruto: brutoTotal, taxas, liquido: liquidoTotal/)
  assert.match(admin, /repasses: repassesTotal/)
  assert.match(admin, /comissoes_plataforma: comissoesTotal/)
})

test('o flag de dados incompletos continua só sobre passeios', () => {
  // Não pode usar os totais com estacionamento, senão vaga de 0% de comissão
  // dispararia o aviso de "dados incompletos" sem necessidade.
  assert.match(admin, /const dadosIncompletos = bruto > 0 && comissoes === 0/)
})
