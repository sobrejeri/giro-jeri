import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, X, ChevronLeft } from 'lucide-react'
import { api } from '../lib/api'
import ChatReserva from './ChatReserva'

// Tempo relativo curto estilo WhatsApp.
function quando(iso) {
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  if (mesmoDia) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// Caixa de conversas (estilo WhatsApp) — ícone com badge + lista + thread.
export default function InboxChat() {
  const [aberto, setAberto]   = useState(false)
  const [conversa, setConversa] = useState(null) // booking selecionado

  const { data: convs } = useQuery({
    queryKey: ['conversations'],
    queryFn:  () => api.getConversations(),
    refetchInterval: 20000,
  })
  const lista = Array.isArray(convs) ? convs : []
  const naoLidas = lista.reduce((s, c) => s + (c.unread || 0), 0)

  return (
    <>
      <button onClick={() => setAberto(true)} aria-label="Conversas"
        className="relative p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
        <MessageCircle size={22} />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && createPortal(
        <>
          <div className="fixed inset-0 bg-black/50 z-[85]" onClick={() => setAberto(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[520px] bg-white rounded-t-3xl z-[85] h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <p className="text-[16px] font-bold text-gray-900">Conversas</p>
              <button onClick={() => setAberto(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={15} className="text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {lista.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <MessageCircle size={36} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-[14px] text-gray-500">Nenhuma conversa ainda.</p>
                  <p className="text-[12px] text-gray-400 mt-1">As mensagens dos clientes aparecem aqui.</p>
                </div>
              ) : lista.map((c) => (
                <button key={c.booking_id} onClick={() => setConversa(c)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-50">
                  <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0 overflow-hidden flex items-center justify-center">
                    {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                      : <span className="text-[16px] font-bold text-gray-500">{(c.name || '?')[0]}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-bold text-gray-900 truncate min-w-0">{c.name}</p>
                      <span className="text-[10px] text-gray-300 font-mono shrink-0">{c.booking_code}</span>
                      <span className="text-[11px] text-gray-400 shrink-0 ml-auto">{quando(c.last_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={`text-[12.5px] truncate ${c.unread ? 'text-gray-800 font-semibold' : 'text-gray-500'}`}>
                        {c.last_mine ? 'Você: ' : ''}{c.last_body}
                      </p>
                      {c.unread > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center shrink-0">{c.unread}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}

      <ChatReserva bookingId={conversa?.booking_id} open={!!conversa} onClose={() => setConversa(null)} />
    </>
  )
}
