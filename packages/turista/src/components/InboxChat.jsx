import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, X, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import ChatReserva from './ChatReserva'

function quando(iso) {
  const d = new Date(iso)
  const hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// Caixa de conversas do cliente (estilo WhatsApp), ao lado do sino.
// variant 'button' (padrão) = ícone no cabeçalho que abre a caixa.
// variant 'listener' = SÓ a caixa (sem ícone), aberta por um evento global
// ('open-inbox-chat'). Serve para a aba "Bate-papo" do menu (admin/operador)
// disparar a caixa de qualquer tela.
export default function InboxChat({ variant = 'button' }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [aberto, setAberto]     = useState(false)

  useEffect(() => {
    if (variant !== 'listener') return
    const abrir = () => setAberto(true)
    window.addEventListener('open-inbox-chat', abrir)
    return () => window.removeEventListener('open-inbox-chat', abrir)
  }, [variant])
  const [conversa, setConversa] = useState(null)
  const [menu, setMenu]         = useState(null) // booking_id com opção de excluir
  const holdRef = useRef(null)

  const { data: convs } = useQuery({
    queryKey: ['conversations'],
    queryFn:  () => api.getConversations(),
    enabled:  !!user,
    refetchInterval: 20000,
  })

  const del = useMutation({
    mutationFn: (bid) => api.deleteConversation(bid),
    onSuccess:  () => { setMenu(null); qc.invalidateQueries({ queryKey: ['conversations'] }) },
  })
  function pressStart(bid) { holdRef.current = setTimeout(() => setMenu(bid), 500) }
  function pressEnd() { if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null } }
  const lista = Array.isArray(convs) ? convs : []
  const naoLidas = lista.reduce((s, c) => s + (c.unread || 0), 0)

  if (!user) return null

  return (
    <>
      {variant !== 'listener' && (
        <button onClick={() => setAberto(true)} aria-label="Conversas"
          className="relative w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform">
          <MessageCircle size={22} className="text-gray-700" />
          {naoLidas > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {naoLidas > 99 ? '99+' : naoLidas}
            </span>
          )}
        </button>
      )}

      {aberto && createPortal(
        <>
          <div className="fixed inset-0 bg-black/50 z-[75]" onClick={() => setAberto(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-[75] h-[85dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <p className="text-[16px] font-bold text-gray-900">Conversas</p>
              <button onClick={() => setAberto(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={15} className="text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {lista.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <MessageCircle size={36} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-[14px] text-gray-500">Nenhuma conversa ainda.</p>
                  <p className="text-[12px] text-gray-400 mt-1">Fale com o operador pela tela da sua reserva.</p>
                </div>
              ) : lista.map((c) => (
                <div key={c.booking_id} className="relative">
                <button
                  onClick={() => setConversa(c)}
                  onTouchStart={() => pressStart(c.booking_id)} onTouchEnd={pressEnd} onTouchMove={pressEnd}
                  onMouseDown={() => pressStart(c.booking_id)} onMouseUp={pressEnd} onMouseLeave={pressEnd}
                  onContextMenu={(e) => { e.preventDefault(); setMenu(c.booking_id) }}
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
                {menu === c.booking_id && (
                  <>
                    <div className="fixed inset-0 z-[1]" onClick={() => setMenu(null)} />
                    <div className="absolute right-4 top-2 z-10 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                      <button
                        onClick={() => { if (confirm('Excluir esta conversa?')) del.mutate(c.booking_id) }}
                        disabled={del.isPending}
                        className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-red-500 active:bg-red-50">
                        <Trash2 size={15} /> Excluir conversa
                      </button>
                    </div>
                  </>
                )}
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}

      <ChatReserva bookingId={conversa?.booking_id} open={!!conversa} onClose={() => setConversa(null)} meuPapel="tourist" />
    </>
  )
}
