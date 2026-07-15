import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  format, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isBefore, isToday, addMonths, subMonths, getDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { isHighSeasonIso } from '../lib/season'

/**
 * DateSheet — calendário (bottom sheet) compartilhado.
 *   value            — Date selecionada
 *   onChange(Date)   — ao escolher um dia
 *   onClose          — fecha
 *   minDate          — 1º dia selecionável (bloqueia anteriores)
 *   seasons          — regras de alta temporada (start/end) → dias EXATOS em laranja
 *   highSeasonMonths — fallback: Set de meses (1-12) → mês inteiro em laranja
 * Renderizado via portal p/ não ser preso por ancestrais com transform.
 */
export default function DateSheet({ value, onChange, onClose, minDate, seasons, highSeasonMonths }) {
  const today = minDate || startOfDay(new Date())
  const [view, setView] = useState(startOfMonth(value || today))
  const days   = eachDayOfInterval({ start: startOfMonth(view), end: endOfMonth(view) })
  const offset = getDay(startOfMonth(view))
  const canPrev = !isBefore(subMonths(view, 1), startOfMonth(today))

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/40 z-[80]" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-[80]">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-[16px] font-bold text-gray-900">Escolha a data</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={14} className="text-gray-500" /></button>
        </div>
        <div className="flex items-center justify-between px-5 mb-3">
          <button disabled={!canPrev} onClick={() => setView(m => subMonths(m, 1))}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-30 active:scale-95">
            <ChevronLeft size={16} className="text-gray-600" />
          </button>
          <p className="text-[14px] font-semibold text-gray-900 capitalize">{format(view, 'MMMM yyyy', { locale: ptBR })}</p>
          <button onClick={() => setView(m => addMonths(m, 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95">
            <ChevronRight size={16} className="text-gray-600" />
          </button>
        </div>
        <div className="grid grid-cols-7 px-4 mb-1">
          {['D','S','T','Q','Q','S','S'].map((d,i) => <div key={i} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 px-4 gap-y-0.5 mb-4">
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
          {days.map(day => {
            const past = isBefore(day, today)
            const sel  = isSameDay(day, value)
            const hs   = seasons?.length
              ? isHighSeasonIso(format(day, 'yyyy-MM-dd'), seasons)
              : !!highSeasonMonths?.has(day.getMonth() + 1)
            return (
              <button key={day.toISOString()} disabled={past} onClick={() => { onChange(day); onClose() }}
                className={`relative aspect-square flex items-center justify-center rounded-full text-[13px] transition-all
                  ${sel ? 'bg-brand text-white font-bold' : ''}
                  ${!sel && past ? 'text-gray-300 cursor-not-allowed' : ''}
                  ${!sel && !past && hs ? 'text-amber-600 font-bold' : ''}
                  ${!sel && !past && !hs && isToday(day) ? 'text-brand font-bold' : ''}
                  ${!sel && !past && !hs && !isToday(day) ? 'text-gray-800 active:bg-gray-100 font-medium' : ''}`}
              >
                {format(day, 'd')}
                {!sel && !past && hs && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-amber-500" />}
              </button>
            )
          })}
        </div>
        {(seasons?.length > 0 || highSeasonMonths?.size > 0) && (
          <div className="flex items-center gap-2 px-5 pb-2 text-[11px] text-amber-600">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            Datas em laranja: alta temporada (pode ter acréscimo no valor)
          </div>
        )}
        <div className="px-4 pb-8">
          <button onClick={onClose} className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform">Confirmar</button>
        </div>
      </div>
    </>,
    document.body,
  )
}
