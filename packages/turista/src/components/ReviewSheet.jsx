import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import { Star, X, Loader2 } from 'lucide-react'
import { api } from '../lib/api'

// ── Avaliação do serviço ─────────────────────────────────────────────────────
// Compartilhado entre a LISTA de reservas e o DETALHE. Nasceu só na lista, e o
// detalhe -- que é onde o cliente cai quando a corrida termina -- não tinha
// como avaliar: a reserva aparecia "Finalizada" e não havia caminho nenhum
// para a avaliação. Uma segunda cópia divergiria na primeira mudança.
//
// A nota vai para a reputação do OPERADOR. Quem é o operador não vem daqui: a
// API resolve pela reserva, então a tela não tem como apontar a nota para
// outro. Ela também exige que o serviço tenha acontecido.

function Overlay({ children }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return createPortal(children, document.body)
}

export default function ReviewSheet({ booking, onClose, onDone }) {
  const [rating,  setRating]  = useState(0)
  const [hover,   setHover]   = useState(0)
  const [comment, setComment] = useState('')
  const [error,   setError]   = useState(null)

  const mut = useMutation({
    mutationFn: () => api.createCoopReview({ booking_id: booking.id, rating, comment: comment.trim() || null }),
    onSuccess: () => onDone?.(),
    onError:   (err) => setError(err?.message || 'Não foi possível enviar sua avaliação.'),
  })

  const serviceName = booking.service_name
    || (booking.service_type === 'tour' ? 'Passeio' : 'Transfer') + ' · ' + booking.booking_code

  return (
    <Overlay>
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Star size={16} className="text-amber-400 fill-amber-400" />
            <h3 className="font-bold text-gray-900">Avaliar serviço</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform">
            <X size={15} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="text-[13px] text-gray-500 mb-1">Como foi sua experiência com</p>
          <p className="font-bold text-gray-900 mb-4 truncate">{serviceName}</p>

          {/* Estrelas */}
          <div className="flex items-center justify-center gap-2 mb-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setRating(s); setError(null) }}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover(0)}
                className="active:scale-90 transition-transform"
                aria-label={`${s} estrela${s > 1 ? 's' : ''}`}
              >
                <Star size={38}
                  className={(hover || rating) >= s ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
              </button>
            ))}
          </div>
          <p className="text-center text-[12px] text-gray-400 mb-4 h-4">
            {['', 'Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente'][hover || rating]}
          </p>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Conte como foi o passeio, o atendimento do operador, o motorista… (opcional)"
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-[14px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
          />

          {error && (
            <p className="text-[12px] text-red-500 bg-red-50 rounded-xl px-3 py-2 mt-3">{error}</p>
          )}

          <button
            onClick={() => { if (!rating) { setError('Escolha de 1 a 5 estrelas.'); return } mut.mutate() }}
            disabled={mut.isPending}
            className="w-full mt-4 bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {mut.isPending ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : 'Enviar avaliação'}
          </button>
        </div>
      </div>
    </div>
    </Overlay>
  )
}
