// Formatação de duração e horário, em um lugar só.
//
// Antes: `fmtDuracao` existia copiado em Home.jsx e TourCard.jsx e NÃO existia
// nas telas de PC — por isso o cartão do celular dizia "4h30" e o do PC dizia
// "4.5h" para o mesmo passeio. E `departure_time` vinha do Postgres como TIME
// ("09:00:00") e era impresso cru na tela de detalhe.

/**
 * Duração em horas decimais → texto curto.
 * 4 → "4h" · 4.5 → "4h30" · 0.5 → "30min"
 */
export function duracao(horas) {
  const n = Number(horas)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1) return `${Math.round(n * 60)}min`
  const inteiras = Math.floor(n)
  const minutos  = Math.round((n - inteiras) * 60)
  // 4.999 arredonda para 60min: vira a hora seguinte em vez de "4h60".
  if (minutos === 60) return `${inteiras + 1}h`
  return minutos === 0 ? `${inteiras}h` : `${inteiras}h${String(minutos).padStart(2, '0')}`
}

/**
 * TIME do Postgres ("09:00:00") → "09h" ou "09h30".
 * Aceita também "9:00", "09:00" e Date. Valor não reconhecido volta como veio,
 * para nunca engolir uma informação que o cliente precisa ver.
 */
export function hora(valor) {
  if (valor == null || valor === '') return null
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return formatar(valor.getHours(), valor.getMinutes())
  }
  const m = String(valor).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return String(valor)
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return String(valor)
  return formatar(h, min)
}

function formatar(h, min) {
  const hh = String(h).padStart(2, '0')
  return min === 0 ? `${hh}h` : `${hh}h${String(min).padStart(2, '0')}`
}
