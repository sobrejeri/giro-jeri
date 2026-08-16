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

// Um dia (ISO yyyy-MM-dd) cai em alguma regra de alta temporada ativa?
export function isHighSeasonIso(iso, seasons = []) {
  if (!iso) return false
  return (seasons || []).some(
    (s) => s?.start_date && s?.end_date && s.is_active !== false && dentroDaRegra(iso, s),
  )
}

// Conjunto de meses (1-12) cobertos por regras ativas. Já tratava a virada de
// ano corretamente — mantido, agora coerente com a checagem por dia acima.
export function highSeasonMonthSet(seasons = []) {
  const set = new Set()
  for (const s of seasons) {
    if (!s?.start_date || !s?.end_date) continue
    if (s.is_active === false) continue
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
