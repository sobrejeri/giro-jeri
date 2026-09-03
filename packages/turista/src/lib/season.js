// Alta temporada no app — MESMA REGRA DO SERVIDOR.
//
// A temporada é RECORRENTE: o admin cadastra apenas mês de início e mês de fim
// ("Julho a Janeiro"), e isso vale TODO ANO. O ano gravado em start_date/
// end_date é só preenchimento — precisa ser ignorado.
//
// Antes este arquivo comparava a data inteira ('2026-08-15' >= '2026-07-01'),
// o que quebrava justamente nas temporadas que viram o ano: o admin grava
// 2026-07-01 → 2026-01-31, com o fim ANTES do início, e nenhuma data casava.
// O calendário não pintava nada, enquanto o servidor (que compara mês/dia)
// cobrava o acréscimo — cliente via "dia normal" e levava a sobretaxa no
// resumo. Ver packages/api/src/services/priceEngine.js → getSeasonAddition.

// Chave mês*100+dia (15/07 → 715), comparável ignorando o ano.
function md(dateIso) {
  const [, m, d] = String(dateIso).slice(0, 10).split('-').map(Number)
  if (!m || !d) return null
  return m * 100 + d
}

// A data cai na faixa da regra? Trata a virada de ano (início depois do fim).
function dentroDaRegra(iso, regra) {
  const alvo = md(iso)
  const ini  = md(regra.start_date)
  const fim  = md(regra.end_date)
  if (alvo == null || ini == null || fim == null) return false
  return ini <= fim
    ? (alvo >= ini && alvo <= fim)   // dentro do mesmo ano
    : (alvo >= ini || alvo <= fim)   // vira o ano (ex.: julho → janeiro)
}

// FERIADO é data EXATA, com ano — diferente da temporada, que é recorrente.
// Comparar mês/dia aqui faria "Feriado 07/09/2026" cobrar em 2027 também.
// Mesma regra do servidor: priceEngine.js → getHolidayAddition usa
// `.eq('holiday_date', serviceDate)`.
function ehFeriadoNaData(iso, regra) {
  const data = regra.holiday_date || regra.start_date
  return !!data && String(data).slice(0, 10) === String(iso).slice(0, 10)
}

// A regra vale para este dia? Feriado por data exata, temporada por mês/dia.
function valeParaODia(iso, regra) {
  if (!regra || regra.is_active === false) return false
  if (regra.kind === 'holiday') return ehFeriadoNaData(iso, regra)
  return !!(regra.start_date && regra.end_date) && dentroDaRegra(iso, regra)
}

// Um dia (ISO yyyy-MM-dd) tem acréscimo — de temporada OU de feriado?
export function isHighSeasonIso(iso, seasons = []) {
  if (!iso) return false
  return (seasons || []).some((s) => valeParaODia(iso, s))
}

/**
 * Regra que vale para o dia, com a MESMA precedência do servidor:
 * feriado ganha da temporada, e nunca somam (priceEngine → getDateSurcharge).
 * Devolve null quando o dia não tem acréscimo nenhum.
 */
export function regraDoDia(iso, regras = []) {
  if (!iso) return null
  const aplicaveis = (regras || []).filter((r) => valeParaODia(iso, r))
  if (aplicaveis.length === 0) return null
  return aplicaveis.find((r) => r.kind === 'holiday') || aplicaveis[0]
}

/** Percentual de acréscimo do dia (0 quando não há, ou quando é valor fixo). */
export function acrescimoPctDoDia(iso, regras = []) {
  const r = regraDoDia(iso, regras)
  if (!r || r.additional_value == null) return 0
  // 'fixed' é acréscimo em reais, não percentual — quem chama aqui quer o %.
  if (r.additional_type === 'fixed') return 0
  return Number(r.additional_value) || 0
}

// Conjunto de meses (1-12) cobertos por regras ativas. Já tratava a virada de
// ano corretamente — mantido, agora coerente com a checagem por dia acima.
export function highSeasonMonthSet(seasons = []) {
  const set = new Set()
  for (const s of seasons) {
    if (s?.is_active === false) continue
    // Feriado ocupa um mês só — o da própria data.
    if (s?.kind === 'holiday') {
      const m = Number(String(s.holiday_date || s.start_date || '').slice(5, 7))
      if (m) set.add(m)
      continue
    }
    if (!s?.start_date || !s?.end_date) continue
    const sm = Number(String(s.start_date).slice(5, 7))
    const em = Number(String(s.end_date).slice(5, 7))
    if (!sm || !em) continue
    if (sm <= em) {
      for (let m = sm; m <= em; m++) set.add(m)
    } else {
      for (let m = sm; m <= 12; m++) set.add(m)
      for (let m = 1;  m <= em; m++) set.add(m)
    }
  }
  return set
}

/**
 * Valor do acréscimo em reais para o dia, sobre um subtotal.
 * MESMA CONTA DO SERVIDOR — priceEngine.js → getDateSurcharge:
 *   • feriado tem precedência sobre a temporada, e nunca somam;
 *   • 'fixed' é valor em reais, 'percentage' (ou nulo) é percentual;
 *   • arredonda em centavos, como o servidor.
 *
 * Existe para o carrinho mostrar o mesmo total que vai ser cobrado. Antes o
 * app somava só os veículos: o cliente via R$ 500 num feriado de +20% e o
 * servidor cobrava R$ 600 no checkout.
 */
export function acrescimoDoDia(iso, regras = [], subtotal = 0) {
  const r = regraDoDia(iso, regras)
  const base = Number(subtotal) || 0
  if (!r || r.additional_value == null || base <= 0) return 0
  const v = Number(r.additional_value) || 0
  if (r.additional_type === 'fixed') return v
  return Math.round(base * (v / 100) * 100) / 100
}

/** Rótulo curto do que está encarecendo o dia — para mostrar na tela. */
export function rotuloDoDia(iso, regras = []) {
  const r = regraDoDia(iso, regras)
  if (!r) return null
  const tipo = r.kind === 'holiday' ? 'Feriado' : 'Alta temporada'
  const sufixo = r.additional_value != null && r.additional_type !== 'fixed'
    ? ` +${Number(r.additional_value)}%`
    : ''
  return `${tipo}${sufixo}`
}
