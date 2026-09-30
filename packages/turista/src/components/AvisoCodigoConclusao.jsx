import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ChevronDown, KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// ── Flutuante do código de conclusão (PIN) ──────────────────────────────────
//
// Enquanto o serviço está EM ANDAMENTO, o cliente precisa ter o código de 4
// dígitos à mão para informar ao motorista SÓ NO FIM. Este flutuante aparece
// sobre qualquer tela do app do turista, para o código não ficar "escondido"
// no detalhe da reserva. Pode ser recolhido num pequeno selo e reaberto.

export default function AvisoCodigoConclusao() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [recolhido, setRecolhido] = useState(false)

  const ehTurista = !!token && (!user || user.user_type === 'tourist')

  // Reservas do cliente em andamento (relê a cada 30s). Só o próprio dono
  // recebe o completion_pin — por isso buscamos o detalhe da 1ª em andamento.
  const { data: emAndamento = [] } = useQuery({
    queryKey: ['pin-bookings'],
    queryFn:  () => api.getMyBookings(),
    enabled:  ehTurista,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    select:   (r) => (r?.data || []).filter((b) => b.status_operational === 'in_progress'),
  })

  const alvo = emAndamento[0]

  const { data: detalhe } = useQuery({
    queryKey: ['pin-detail', alvo?.id],
    queryFn:  () => api.getBooking(alvo.id),
    enabled:  !!alvo,
    refetchInterval: 30_000,
  })

  const pin  = detalhe?.completion_pin ? String(detalhe.completion_pin) : null
  const nome = detalhe?.service_name || alvo?.service_name || 'Seu serviço'

  if (!ehTurista || !alvo || !pin) return null

  // Selo recolhido: um botão pequeno que reabre o cartão.
  if (recolhido) {
    return (
      <button
        onClick={() => setRecolhido(false)}
        className="fixed right-3 bottom-[80px] z-[95] flex items-center gap-1.5 bg-brand text-white font-bold rounded-full pl-3 pr-4 py-2.5 shadow-lg shadow-brand/30 active:scale-95 transition-transform"
        aria-label="Ver código de conclusão"
      >
        <KeyRound size={16} />
        <span className="text-[13px]">Código {pin}</span>
      </button>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-[76px] z-[95] px-3 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-[430px] mx-auto bg-white rounded-2xl border-2 border-brand/30 shadow-2xl shadow-brand/20 overflow-hidden animate-[slideUp_.25s_ease-out]">
        <div className="bg-brand px-4 py-2.5 flex items-center gap-2 text-white">
          <ShieldCheck size={16} />
          <span className="text-[12px] font-bold uppercase tracking-wide flex-1">Código de conclusão</span>
          <button
            onClick={() => setRecolhido(true)}
            className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center active:scale-95"
            aria-label="Recolher"
          >
            <ChevronDown size={15} />
          </button>
        </div>

        <div className="p-4">
          <p className="text-[12px] text-gray-500 mb-3 leading-snug">
            Informe o código <b>ao motorista</b> e <b>só ao final</b> do serviço —{' '}
            {nome} ({alvo.booking_code}). Nunca compartilhe por telefone, mensagem ou com terceiros.
          </p>
          <div className="flex items-center justify-center gap-2">
            {pin.split('').map((d, i) => (
              <span key={i} className="w-11 h-14 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center text-2xl font-bold font-mono text-brand">{d}</span>
            ))}
          </div>
          <button
            onClick={() => navigate(`/minhas-reservas/${alvo.id}`)}
            className="mt-3 w-full text-center text-[13px] font-bold text-brand active:scale-[0.98] transition-transform"
          >
            Ver reserva
          </button>
        </div>
      </div>
    </div>
  )
}
