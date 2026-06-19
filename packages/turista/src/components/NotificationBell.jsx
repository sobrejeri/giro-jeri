import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

function timeAgo(iso) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR }) }
  catch { return '' }
}

// Sininho de notificações: contador de não lidas + painel com a lista.
// `dark` adapta a cor do ícone para fundos escuros. `bookingsPath` é o destino
// ao tocar numa notificação ligada a uma reserva.
export default function NotificationBell({ bookingsPath = '/minhas-reservas', dark = false }) {
  const { token }  = useAuth()
  const [open, setOpen] = useState(false)
  const ref      = useRef(null)
  const qc       = useQueryClient()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey:             ['notifications'],
    queryFn:              () => api.getNotifications(),
    enabled:              !!token,
    refetchInterval:      45_000,
    refetchOnWindowFocus: true,
    staleTime:            20_000,
  })
  const items  = data?.items || []
  const unread = data?.unread || 0

  const markRead = useMutation({
    mutationFn: () => api.markNotificationsRead(),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  useEffect(() => {
    if (!open) return
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!token) return null

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) markRead.mutate()
  }
  function openItem(n) {
    setOpen(false)
    if (n.booking_id) navigate(bookingsPath)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label="Notificações"
        className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
      >
        <Bell size={18} className={dark ? 'text-white' : 'text-gray-600'} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(340px,calc(100vw-24px))] bg-white rounded-2xl shadow-2xl border border-gray-100 z-[200] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <p className="text-[14px] font-bold text-gray-900">Notificações</p>
            {unread > 0 && <span className="text-[11px] text-gray-400">{unread} nova(s)</span>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={22} className="text-gray-300 mx-auto mb-2" />
                <p className="text-[13px] text-gray-400">Nenhuma notificação ainda</p>
              </div>
            ) : items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors ${n.read_at ? '' : 'bg-orange-50/40'}`}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="w-2 h-2 rounded-full bg-brand mt-1.5 shrink-0" />}
                  <div className={`flex-1 min-w-0 ${n.read_at ? 'pl-4' : ''}`}>
                    {n.title && <p className="text-[13px] font-bold text-gray-900 leading-tight">{n.title}</p>}
                    <p className="text-[12px] text-gray-600 mt-0.5 leading-snug">{n.message_body}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
