// ── parking/seasonRules.js — Alta temporada/feriado por estacionamento ───────
//
// Regras do PRÓPRIO lot (tabela parking_season_rules, migração 121). Mesma
// semântica dos passeios:
//   • season   faixa RECORRENTE (o ano é ignorado: "dez a fev" vale todo ano)
//   • holiday  data EXATA (com ano) e com PRECEDÊNCIA sobre a temporada
// Acréscimo 'percentage' (+X% sobre a diária) ou 'fixed' (+R$ por diária).
// O corte é por DIÁRIA: só as diárias que caem num dia de regra pagam a mais.

import { supabase } from '../../supabase.js'

// mês*100+dia — comparável ignorando o ano (temporada é recorrente).
function md(iso) {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return (m && d) ? m * 100 + d : null
}
function dentroDaFaixa(iso, r) {
  const t = md(iso), s = md(r.start_date), e = md(r.end_date)
  if (t == null || s == null || e == null) return false
  return s <= e ? (t >= s && t <= e)    // mesmo ano
                : (t >= s || t <= e)     // vira o ano (ex.: dez → fev)
}
function ehFeriado(iso, r) {
  const d = r.holiday_date || r.start_date
  return !!d && String(d).slice(0, 10) === String(iso).slice(0, 10)
}
function valeNoDia(iso, r) {
  if (!r || r.is_active === false) return false
  return r.kind === 'holiday'
    ? ehFeriado(iso, r)
    : (!!(r.start_date && r.end_date) && dentroDaFaixa(iso, r))
}

// Regra que vale para o dia — feriado ganha da temporada; nunca somam.
export function regraDoDia(iso, rules = []) {
  const aplic = (rules || []).filter((r) => valeNoDia(iso, r))
  if (!aplic.length) return null
  return aplic.find((r) => r.kind === 'holiday') || aplic[0]
}

// Lê as regras ATIVAS do lot. Tolerante: tabela ausente (migração 121 pendente)
// → lista vazia, sem acréscimo e sem quebrar a cotação.
export async function listLotSeasonRules(lotId) {
  if (!lotId) return []
  try {
    const { data, error } = await supabase
      .from('parking_season_rules')
      .select('id, kind, name, start_date, end_date, holiday_date, additional_type, additional_value, is_active')
      .eq('lot_id', lotId).eq('is_active', true)
    if (error) return []
    return data || []
  } catch { return [] }
}

// Data (YYYY-MM-DD) de um instante no fuso de Jeri (−03:00, sem verão).
const isoJeri = (ms) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(ms))

// Acréscimo TOTAL (reais) para o período, somado por diária. A diária i começa
// em start + i*horasPorDiaria e sua DATA define se há regra. 'percentage' incide
// sobre o preço de UMA diária; 'fixed' é o valor cheio por diária.
export function surchargeForPeriod({ rules, startMs, diarias, horasPorDiaria = 24, precoDiariaReais }) {
  if (!rules?.length || !diarias) return 0
  const baseCents = Math.round(Number(precoDiariaReais) * 100)
  let totalCents = 0
  for (let i = 0; i < diarias; i++) {
    const iso = isoJeri(startMs + i * (Number(horasPorDiaria) || 24) * 3_600_000)
    const r = regraDoDia(iso, rules)
    if (!r || r.additional_value == null) continue
    totalCents += r.additional_type === 'fixed'
      ? Math.round(Number(r.additional_value) * 100)
      : Math.round(baseCents * (Number(r.additional_value) / 100))
  }
  return totalCents / 100
}
