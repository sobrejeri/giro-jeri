import { useState, useRef, useEffect } from 'react'
import {
  format, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isBefore, isToday, addMonths, subMonths, getDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { isHighSeasonIso } from '../lib/season'

/**
 * DesktopDatePicker — campo de data com calendário popover para telas grandes.
 * Substitui o <input type="date"> nativo para mostrar as datas de alta
 * temporada em laranja (o nativo não permite colorir dias).
 *   valueIso  — 'yyyy-MM-dd' selecionado
 *   onChange  — recebe o novo 'yyyy-MM-dd'
 *   minIso    — 1º dia selecionável (regras de antecedência/cutoff)
 *   seasons   — regras de alta temporada (start/end) → dias exatos em laranja
 */
export default function DesktopDatePicker({ valueIso, onChange, minIso, seasons = [], className = '' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const value   = valueIso ? new Date(`${valueIso}T12:00:00`) : null
  const minDate = minIso ? startOfDay(new Date(`${minIso}T12:00:00`)) : startOfDay(new Date())
  const [view, setView] = useState(() => startOfMonth(value || minDate))

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Reabre sempre no mês da data selecionada (ou no 1º mês disponível)
  useEffect(() => {
    if (open) setView(startOfMonth(value || minDate))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const days    = eachDayOfInterval({ start: startOfMonth(view), end: endOfMonth(view) })
  const offset  = getDay(startOfMonth(view))
  const canPrev = !isBefore(subMonths(view, 1), startOfMonth(minDate))
  const hasSeasons = seasons.length > 0

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-left"
      >
        <Calendar size={15} className="text-brand shrink-0" />
        <span className="flex-1 text-[14px] font-semibold text-gray-800">
          {value ? format(value, "d 'de' MMM yyyy", { locale: ptBR }) : 'Escolher data'}
        </span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-2 w-[300px] bg-white rounded-2xl shadow-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button" disabled={!canPrev}
              onClick={() => setView((m) => subMonths(m, 1))}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-30 hover:bg-gray-200 transition-colors"
            >
              <ChevronLeft size={15} className="text-gray-600" />
            </button>
            <p className="text-[13px] font-semibold text-gray-900 capitalize">
              {format(view, 'MMMM yyyy', { locale: ptBR })}
            </p>
            <button
              type="button"
              onClick={() => setView((m) => addMonths(m, 1))}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <ChevronRight size={15} className="text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {['D','S','T','Q','Q','S','S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
            {days.map((day) => {
              const past = isBefore(day, minDate)
              const sel  = !!value && isSameDay(day, value)
              const hs   = isHighSeasonIso(format(day, 'yyyy-MM-dd'), seasons)
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={past}
                  onClick={() => { onChange(format(day, 'yyyy-MM-dd')); setOpen(false) }}
                  className={`relative aspect-square flex items-center justify-center rounded-full text-[12.5px] transition-all
                    ${sel ? 'bg-brand text-white font-bold' : ''}
                    ${!sel && past ? 'text-gray-300 cursor-not-allowed' : ''}
                    ${!sel && !past && hs ? 'text-amber-600 font-bold hover:bg-amber-50' : ''}
                    ${!sel && !past && !hs && isToday(day) ? 'text-brand font-bold hover:bg-gray-100' : ''}
                    ${!sel && !past && !hs && !isToday(day) ? 'text-gray-800 hover:bg-gray-100 font-medium' : ''}`}
                >
                  {format(day, 'd')}
                  {!sel && !past && hs && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-amber-500" />}
                </button>
              )
            })}
          </div>

          {hasSeasons && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50 text-[11px] text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              Datas em laranja: alta temporada (pode ter acréscimo)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
