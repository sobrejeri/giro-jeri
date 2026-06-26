import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Componente puro: recebe um ISO de alvo e devolve um chip pequeno com o tempo
// restante (ex.: "faltam 23min"), atualizado a cada minuto. É um COMPLEMENTO
// da hora-alvo absoluta — nunca a única informação de prazo na tela (UX
// pede hora absoluta como principal, contagem regressiva só como reforço).
// Sem alert/confirm nativos, sem libs novas. Respeita motion-reduce.
function diffParts(target) {
  const ms = new Date(target).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  return ms
}

export default function Countdown({ target, className = '' }) {
  const { t } = useTranslation()
  const [ms, setMs] = useState(() => diffParts(target))

  useEffect(() => {
    setMs(diffParts(target))
    const id = setInterval(() => setMs(diffParts(target)), 30_000)
    return () => clearInterval(id)
  }, [target])

  if (ms == null) return null
  if (ms <= 0) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 ${className}`}>
        {t('bookings.countdown.expired')}
      </span>
    )
  }

  const totalMin = Math.floor(ms / 60_000)
  const hours    = Math.floor(totalMin / 60)
  const minutes  = totalMin % 60
  const label    = hours > 0
    ? t('bookings.countdown.hoursMinutes', { hours, minutes })
    : t('bookings.countdown.minutes', { minutes: Math.max(minutes, 1) })

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full motion-reduce:animate-none animate-pulse ${className}`}
    >
      {label}
    </span>
  )
}
