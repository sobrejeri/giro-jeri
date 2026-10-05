// ── parking/financial.js — Agregação financeira do ESTACIONAMENTO ────────────
//
// Fonte única para somar o estacionamento nos painéis gerais (Dashboard,
// Financeiro). Mesma base da aba Estacionamentos → Repasses (parking_reservations
// pagas, por `created_at`, com a comissão snapshot da reserva), para os números
// baterem entre as telas.
//
// Modelo do estacionamento (INVERSO ao do passeio): o dono do lote fica com o
// bruto; a RECEITA DA PLATAFORMA é a comissão; o "repasse" é o líquido do
// parceiro (bruto − comissão).
//
// Tudo em CENTAVOS para não acumular erro de arredondamento; o chamador divide
// por 100. Best-effort: qualquer erro é relançado para o chamador tratar (os
// endpoints embrulham em try/catch e seguem sem o estacionamento se falhar).

import { supabase } from '../../supabase.js'

const centavos = (v) => Math.round(Number(v || 0) * 100)

// Totais num intervalo [from, to). `from`/`to` são ISO/date string (ou null).
// → { brutoC, comissaoC, liquidoC, qtd } em centavos.
export async function parkingFinanceiro({ from = null, to = null } = {}) {
  let q = supabase.from('parking_reservations')
    .select('total_amount, commission_pct, created_at')
    .eq('payment_status', 'paid')
  if (from) q = q.gte('created_at', from)
  if (to)   q = q.lt('created_at', to)
  const { data, error } = await q
  if (error) throw error

  let brutoC = 0, comissaoC = 0
  for (const r of data || []) {
    const b = centavos(r.total_amount)
    brutoC += b
    comissaoC += Math.round(b * Number(r.commission_pct || 0) / 100)
  }
  return { brutoC, comissaoC, liquidoC: brutoC - comissaoC, qtd: (data || []).length }
}

// Série diária para o gráfico de faturamento: { 'YYYY-MM-DD': { brutoC, comissaoC } }.
export async function parkingFaturamentoDiario({ since } = {}) {
  let q = supabase.from('parking_reservations')
    .select('total_amount, commission_pct, created_at')
    .eq('payment_status', 'paid')
  if (since) q = q.gte('created_at', since)
  const { data, error } = await q
  if (error) throw error

  const porDia = {}
  for (const r of data || []) {
    const dia = String(r.created_at || '').slice(0, 10)
    if (!dia) continue
    const b = centavos(r.total_amount)
    const c = Math.round(b * Number(r.commission_pct || 0) / 100)
    if (!porDia[dia]) porDia[dia] = { brutoC: 0, comissaoC: 0 }
    porDia[dia].brutoC += b
    porDia[dia].comissaoC += c
  }
  return porDia
}
