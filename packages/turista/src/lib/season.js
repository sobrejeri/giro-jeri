// Conjunto de meses (1-12) cobertos por regras de alta temporada ativas.
// As regras são definidas por mês (start_date/end_date, dia 01→último);
// trata a virada de ano (ex.: Julho → Janeiro).
export function highSeasonMonthSet(seasons = []) {
  const set = new Set()
  for (const s of seasons) {
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
