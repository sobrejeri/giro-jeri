// Taxa de cancelamento por proximidade do serviço (só cálculo/exibição — a
// cobrança/estorno ainda não é automática). Escala crescente.
//   Translado: ≥7d grátis · 48h 2% · 24h 5% · 12h 7% · <12h 10%
//   Passeio:   >1h grátis · 30min 2% · 5min 5% · <5min 7%
function combinarDataHora(dataIso, hora) {
  if (!dataIso) return null
  const hh = /^\d{2}:\d{2}/.test(hora || '') ? hora.slice(0, 5) : '12:00'
  const d = new Date(`${dataIso}T${hh}:00`)
  return isNaN(d.getTime()) ? null : d
}

export function taxaCancelamento({ serviceType, serviceDate, serviceTime }) {
  const dt = combinarDataHora(serviceDate, serviceTime)
  if (!dt) return { pct: null, label: 'A taxa depende de quanto falta para o serviço.' }
  const horas = (dt.getTime() - Date.now()) / 3_600_000
  const isTransfer = serviceType === 'transfer'

  let pct
  if (isTransfer) {
    if (horas >= 168) pct = 0
    else if (horas >= 48) pct = 2
    else if (horas >= 24) pct = 5
    else if (horas >= 12) pct = 7
    else pct = 10
  } else {
    if (horas >= 1) pct = 0
    else if (horas >= 0.5) pct = 2
    else if (horas >= (5 / 60)) pct = 5
    else pct = 7
  }

  const label = pct === 0
    ? 'Sem taxa de cancelamento — estorno integral.'
    : `Taxa de cancelamento de ${pct}% sobre o valor da reserva.`
  return { pct, label }
}
