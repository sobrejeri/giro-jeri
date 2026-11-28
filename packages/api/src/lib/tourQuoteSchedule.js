// Regras de solicitação de cotação de passeio, compartilhadas entre cliente
// e API. Prazos calculados no fuso de Jericoacoara/Fortaleza (UTC-3).
// Não consulta banco nem usa dependências externas: teste determinístico.
const FORTALEZA_OFFSET_MS = 3 * 60 * 60 * 1000
export const ANTECEDENCIA_PADRAO_COTACAO_HORAS = 3
export const CUTOFF_PADRAO_PASSEIO = '12:00'

const localIso = (ms) => new Date(ms - FORTALEZA_OFFSET_MS).toISOString().slice(0, 16)
const localParaMs = (date, time) => Date.parse(`${date}T${time}:00-03:00`)
const minutos = (text) => {
  const t = String(text || '').slice(0, 5)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return null
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
}

export function regrasPrazoPasseio(tour = null) {
  // Null = sem configuração: mantém um mínimo conservador para cotações
  // personalizadas. Zero no cadastro é uma escolha explícita do admin.
  const raw = tour?.min_advance_hours
  const n = raw == null || raw === '' ? ANTECEDENCIA_PADRAO_COTACAO_HORAS : Number(raw)
  const hours = Number.isFinite(n) && n >= 0 ? n : ANTECEDENCIA_PADRAO_COTACAO_HORAS
  const cutoff = minutos(tour?.booking_cutoff_time) == null
    ? CUTOFF_PADRAO_PASSEIO : String(tour.booking_cutoff_time).slice(0, 5)
  return { hours, cutoff }
}

export function avaliarPrazoCotacaoPasseio({ date, time, tour = null, nowMs = Date.now() } = {}) {
  const { hours, cutoff } = regrasPrazoPasseio(tour)
  const hoje = localIso(nowMs).slice(0, 10)
  // Reserva precisa acontecer depois do instante mínimo, em minuto completo.
  let minMs = (Math.floor((nowMs + hours * 3600_000) / 60_000) + 1) * 60_000
  const cutoffMs = localParaMs(hoje, cutoff)
  if (nowMs >= cutoffMs) {
    const amanha = localIso(localParaMs(hoje, '00:00') + 24 * 3600_000).slice(0, 10)
    minMs = Math.max(minMs, localParaMs(amanha, '00:00'))
  }
  const earliest = localIso(minMs)
  const minDateIso = earliest.slice(0, 10)
  const minTime = earliest.slice(11, 16)
  const base = { minDateIso, minTime, hours, cutoff }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || minutos(time) == null) {
    return { ...base, ok: false, error: 'Selecione uma data e um horário válidos.' }
  }
  const selectedMs = localParaMs(date, time)
  if (!Number.isFinite(selectedMs) || localIso(selectedMs).slice(0, 16) !== `${date}T${time}`) {
    return { ...base, ok: false, error: 'Data ou horário inválidos.' }
  }
  if (selectedMs < minMs) {
    const passouCutoff = nowMs >= cutoffMs && date === hoje
    const motivo = passouCutoff
      ? `O limite para solicitar passeios no mesmo dia é ${cutoff}.`
      : `Este passeio exige pelo menos ${hours} hora(s) de antecedência.`
    return { ...base, ok: false,
      error: `${motivo} Escolha a partir de ${minDateIso} às ${minTime} (horário de Fortaleza).` }
  }
  const inicio = minutos(tour?.service_window_start)
  const fim = minutos(tour?.service_window_end)
  const hora = minutos(time)
  if ((inicio != null && hora < inicio) || (fim != null && hora > fim)) {
    return { ...base, ok: false,
      error: `O horário precisa estar dentro da janela do passeio (${inicio == null ? '00:00' : String(tour.service_window_start).slice(0, 5)} a ${fim == null ? '23:59' : String(tour.service_window_end).slice(0, 5)}).` }
  }
  return { ...base, ok: true, error: null }
}
