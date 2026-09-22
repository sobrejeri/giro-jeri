import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Send, Loader2, Check, CheckCheck, Trash2 } from 'lucide-react'
import { api } from '../lib/api'

// Chat da reserva (cliente ↔ operador). Sheet que abre por um botão. Faz
// polling curto enquanto aberto. "meuPapel" define de que lado a bolha aparece.
export default function ChatReserva({ bookingId, open, onClose, meuPapel = 'tourist' }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [menu, setMenu] = useState(null) // { id } da mensagem com opção de excluir
  const holdRef = useRef(null)
  const fimRef = useRef(null)

  const { data: msgs, isLoading } = useQuery({
    queryKey: ['booking-messages', bookingId],
    queryFn:  () => api.getBookingMessages(bookingId),
    enabled:  open && !!bookingId,
    refetchInterval: open ? 5000 : false,
  })

  const send = useMutation({
    mutationFn: () => api.sendBookingMessage(bookingId, text.trim()),
    onSuccess:  () => { setText(''); qc.invalidateQueries({ queryKey: ['booking-messages', bookingId] }) },
  })

  const del = useMutation({
    mutationFn: (msgId) => api.deleteBookingMessage(bookingId, msgId),
    onSuccess:  () => { setMenu(null); qc.invalidateQueries({ queryKey: ['booking-messages', bookingId] }) },
  })

  // Segurar (~500ms) na própria mensagem abre a opção de excluir.
  function pressStart(m) {
    if (m.sender_role !== meuPapel) return
    holdRef.current = setTimeout(() => setMenu({ id: m.id }), 500)
  }
  function pressEnd() { if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null } }

  useEffect(() => {
    if (open) setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [msgs, open])

  if (!open) return null

  function enviar(e) {
    e.preventDefault()
    if (text.trim() && !send.isPending) send.mutate()
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 z-[75]" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-[75] h-[80dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <p className="text-[15px] font-bold text-gray-900">Chat da reserva</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={15} className="text-gray-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50">
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="text-brand animate-spin" /></div>
          ) : (msgs || []).length === 0 ? (
            <p className="text-[13px] text-gray-400 text-center py-8">Sem mensagens ainda. Envie a primeira!</p>
          ) : (msgs || []).map((m) => {
            const meu = m.sender_role === meuPapel
            return (
              <div key={m.id} className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
                <div className="relative max-w-[78%]">
                  <div
                    onTouchStart={() => pressStart(m)} onTouchEnd={pressEnd} onTouchMove={pressEnd}
                    onMouseDown={() => pressStart(m)} onMouseUp={pressEnd} onMouseLeave={pressEnd}
                    onContextMenu={(e) => { if (meu) { e.preventDefault(); setMenu({ id: m.id }) } }}
                    className={`px-3 py-2 rounded-2xl text-[13.5px] leading-snug select-none ${
                      meu ? 'bg-brand text-white rounded-br-sm' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
                    }`}
                  >
                    {m.body}
                    <span className={`flex items-center gap-1 justify-end text-[9.5px] mt-0.5 ${meu ? 'text-white/70' : 'text-gray-400'}`}>
                      {new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {meu && (m.read_at
                        ? <CheckCheck size={13} className="text-white" />
                        : <Check size={12} className="text-white/70" />)}
                    </span>
                  </div>
                  {menu?.id === m.id && (
                    <>
                      <div className="fixed inset-0 z-[1]" onClick={() => setMenu(null)} />
                      <div className="absolute right-0 -bottom-9 z-10 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                        <button onClick={() => del.mutate(m.id)} disabled={del.isPending}
                          className="flex items-center gap-2 px-3 py-2 text-[13px] font-semibold text-red-500 active:bg-red-50">
                          <Trash2 size={14} /> Excluir
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={fimRef} />
        </div>

        {send.isError && (
          <p className="px-4 text-[12px] text-red-500 text-center pb-1">{send.error?.message || 'Não foi possível enviar.'}</p>
        )}
        <form onSubmit={enviar} className="shrink-0 border-t border-gray-100 px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))] flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000}
            placeholder="Escreva uma mensagem…"
            className="flex-1 h-10 px-4 rounded-full bg-gray-100 text-[14px] text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-brand/30" />
          <button type="submit" disabled={!text.trim() || send.isPending}
            className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-90 transition-transform">
            {send.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </form>
      </div>
    </>,
    document.body,
  )
}
