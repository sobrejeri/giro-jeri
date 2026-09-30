import { useEffect, useState } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'

// ── TempoServico ────────────────────────────────────────────────────────────
// Mostra QUANTO FALTA até a execução do serviço (service_date + service_time),
// para o operador saber quando a corrida acontece e se está perto. Dois níveis
// de destaque: "Hoje" (mesmo dia) e "Em breve" (≤ 2h, pulsante). Serviço com
// horário já passado e ainda não concluído aparece como "Atrasado".
//
// 100% no cliente: usa os campos que já vêm no feed, sem tocar no backend.

const DUAS_HORAS = 2 * 60 * 60 * 1000

// Junta data (YYYY-MM-DD) + hora (HH:MM[:SS]) num Date local.
function montarData(date, time) {
  if (!date) return null
  const hhmm = (time || '00:00').slice(0, 5)
  const d = new Date(`${date}T${hhmm}:00`)
  return isNaN(d.getTime()) ? null : d
}

function mesmoDia(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Calcula rótulo + nível a partir de agora.
export function calcularTempo(date, time, agora = Date.now()) {
  const alvo = montarData(date, time)
  if (!alvo) return null
  const diff = alvo.getTime() - agora
  const hhmm = (time || '').slice(0, 5)

  // Já passou (e não foi concluído — quem chama decide se mostra).
  if (diff < 0) return { label: 'Atrasado', nivel: 'atrasado' }

  const min  = Math.round(diff / 60000)
  const h    = Math.floor(min / 60)
  const m    = min % 60

  // ≤ 2h → "Em breve" (pulsante), com contagem fina.
  if (diff <= DUAS_HORAS) {
    const txt = h > 0 ? `em ${h}h${m > 0 ? ` ${m}min` : ''}` : `em ${m} min`
    return { label: `Começa ${txt}`, nivel: 'embreve' }
  }

  const hoje = new Date(agora)
  if (mesmoDia(alvo, hoje)) {
    return { label: `Hoje${hhmm ? ` ${hhmm}` : ''}`, nivel: 'hoje' }
  }

  const amanha = new Date(agora + 24 * 60 * 60 * 1000)
  if (mesmoDia(alvo, amanha)) {
    return { label: `Amanhã${hhmm ? ` ${hhmm}` : ''}`, nivel: null }
  }

  const dias = Math.ceil(diff / (24 * 60 * 60 * 1000))
  if (dias <= 7) return { label: `Em ${dias} dias`, nivel: null }

  const dd = String(alvo.getDate()).padStart(2, '0')
  const mm = String(alvo.getMonth() + 1).padStart(2, '0')
  return { label: `${dd}/${mm}${hhmm ? ` ${hhmm}` : ''}`, nivel: null }
}

const ESTILO = {
  atrasado: 'bg-red-100 text-red-600',
  embreve:  'bg-amber-100 text-amber-700',
  hoje:     'bg-brand/10 text-brand',
  neutro:   'bg-gray-100 text-gray-500',
}

// Prazo de ACEITE da solicitação (acceptance_expires_at, 24h): quanto tempo o
// operador ainda tem para pegar antes de a corrida sair da fila. Vermelho e
// pulsante quando falta pouco.
export function calcularPrazoAceite(expiresAt, agora = Date.now()) {
  if (!expiresAt) return null
  const fim = new Date(expiresAt).getTime()
  if (isNaN(fim)) return null
  const diff = fim - agora
  if (diff <= 0) return { label: 'Prazo esgotado', urgente: true }
  const min = Math.round(diff / 60000)
  const h   = Math.floor(min / 60)
  const m   = min % 60
  const txt = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m} min`
  return { label: `Expira em ${txt}`, urgente: diff <= 60 * 60 * 1000 }
}

export function PrazoAceite({ expiresAt, className = '' }) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const info = calcularPrazoAceite(expiresAt, agora)
  if (!info) return null
  const cls = info.urgente ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls} ${className}`}>
      <Clock size={11} className={`shrink-0 ${info.urgente ? 'animate-pulse' : ''}`} />
      {info.label}
    </span>
  )
}

// `oculto`: quando a reserva não está mais na janela relevante (concluída), o
// chamador passa oculto para não mostrar "Atrasado" numa corrida já encerrada.
export default function TempoServico({ date, time, oculto = false, className = '' }) {
  const [agora, setAgora] = useState(() => Date.now())

  // Atualiza a cada 30s para a contagem "andar" mesmo sem refetch do feed.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  if (oculto) return null
  const info = calcularTempo(date, time, agora)
  if (!info) return null

  const cls = ESTILO[info.nivel || 'neutro']
  const pulsa = info.nivel === 'embreve'

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls} ${className}`}>
      {info.nivel === 'atrasado'
        ? <AlertTriangle size={11} className="shrink-0" />
        : <Clock size={11} className={`shrink-0 ${pulsa ? 'animate-pulse' : ''}`} />}
      {info.label}
    </span>
  )
}
