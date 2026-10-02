import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ChevronLeft, Clock, Car, Loader2, CheckCircle2, LogIn, KeyRound, ParkingSquare } from 'lucide-react'
import { api } from '../lib/api'

const money = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const dt = (s) => { try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return s } }

const BANNER = {
  awaiting_partner:          { t: 'Aguardando o estacionamento', s: 'Assim que aceitarem, você paga para confirmar.', cls: 'bg-amber-50 text-amber-700' },
  accepted_awaiting_payment: { t: 'Aceita — pague para confirmar', s: 'O estacionamento aceitou. Pague para garantir a vaga.', cls: 'bg-brand/10 text-brand' },
  confirmed:                 { t: 'Reserva confirmada 🎉', s: 'Apresente o código de entrada no pátio.', cls: 'bg-emerald-50 text-emerald-700' },
  in_lot:                    { t: 'Veículo no pátio', s: 'Quando quiser sair, peça a retirada.', cls: 'bg-blue-50 text-blue-700' },
  withdrawal_requested:      { t: 'Retirada solicitada', s: 'Mostre o PIN ao atendente para liberar.', cls: 'bg-blue-50 text-blue-700' },
  completed:                 { t: 'Estadia concluída', s: 'Obrigado! Que tal avaliar?', cls: 'bg-gray-100 text-gray-600' },
  rejected:                  { t: 'Recusada', s: 'O estacionamento não aceitou.', cls: 'bg-red-50 text-red-600' },
  expired_no_answer:         { t: 'Expirada', s: 'Não houve resposta a tempo.', cls: 'bg-gray-100 text-gray-500' },
  expired_no_payment:        { t: 'Expirou sem pagamento', s: 'O prazo de pagamento terminou.', cls: 'bg-gray-100 text-gray-500' },
  cancelled:                 { t: 'Cancelada', s: 'Esta reserva foi cancelada.', cls: 'bg-red-50 text-red-600' },
}

export default function EstacionamentoReserva() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [pin, setPin] = useState(null)

  const { data: r, isLoading } = useQuery({ queryKey: ['parking-res', id], queryFn: () => api.parkingReservation(id), refetchInterval: 10000 })
  const { data: lot } = useQuery({ queryKey: ['parking-lot', r?.lot_id], queryFn: () => api.parkingLot(r.lot_id), enabled: !!r?.lot_id })

  const pedirRetirada = useMutation({
    mutationFn: () => api.parkingWithdrawal(id),
    onSuccess: (res) => setPin({ pin: res.pin, expires_at: res.expires_at }),
  })

  if (isLoading) return <p className="p-6 text-center text-gray-400 text-sm">Carregando…</p>
  if (!r) return <p className="p-6 text-center text-gray-400 text-sm">Reserva não encontrada.</p>

  const b = BANNER[r.status] || { t: r.status, s: '', cls: 'bg-gray-100 text-gray-600' }
  const foto = Array.isArray(lot?.photos) ? lot.photos[0] : null
  const pago = r.payment_status === 'paid'
  const mostraEntrada = r.entry_code && ['confirmed', 'in_lot', 'withdrawal_requested'].includes(r.status)
  const podeRetirar = ['in_lot', 'withdrawal_requested'].includes(r.status)
  const podeEstender = ['confirmed', 'in_lot'].includes(r.status) && pago
  const podeCancelar = ['awaiting_partner', 'accepted_awaiting_payment', 'confirmed'].includes(r.status)

  const passos = [
    { label: 'Aguardando o estacionamento', done: true },
    { label: 'Pagamento', done: pago, atual: r.status === 'accepted_awaiting_payment' },
    { label: 'Confirmada', done: ['confirmed', 'in_lot', 'withdrawal_requested', 'completed'].includes(r.status) },
    { label: 'No pátio', done: ['in_lot', 'withdrawal_requested', 'completed'].includes(r.status), atual: r.status === 'in_lot' },
    { label: 'Finalizada', done: r.status === 'completed' },
  ]

  return (
    <div className="pb-10">
      <header className="flex items-center gap-3 px-4 h-14 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95"><ChevronLeft size={20} className="text-gray-700" /></button>
        <h1 className="text-lg font-bold text-gray-900">Detalhes da reserva</h1>
        <span className="ml-auto font-mono text-[12px] text-gray-400">{r.code}</span>
      </header>

      <main className="px-4 pt-4 space-y-3">
        {/* Banner de status */}
        <div className={`rounded-2xl p-4 ${b.cls}`}>
          <p className="font-bold text-[15px] flex items-center gap-2"><Clock size={16} /> {b.t}</p>
          {b.s && <p className="text-[13px] opacity-90 mt-0.5">{b.s}</p>}
        </div>

        {/* Ação principal */}
        {r.status === 'accepted_awaiting_payment' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-gray-900 flex items-center gap-2"><CheckCircle2 size={18} className="text-brand" /> Operador aceitou! 🎉</p>
            <p className="text-[13px] text-gray-500 mt-0.5">Pague para confirmar sua reserva.</p>
            <Contagem until={r.payment_deadline_at} prefixo="Pague em" expirado="Prazo de pagamento expirado" />
            <button onClick={() => navigate(`/estacionamento/${id}/pagar`)}
              className="mt-2 w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[15px] active:scale-[0.98]">Pagar agora · {money(r.total_amount)}</button>
          </div>
        )}
        {r.status === 'awaiting_partner' && (
          <Contagem until={r.acceptance_expires_at} prefixo="Aguardando aceite · expira em" expirado="Sem resposta no prazo" />
        )}

        {mostraEntrada && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-emerald-700 flex items-center gap-1.5"><LogIn size={14} /> Código de entrada</span>
            <span className="font-mono text-[18px] font-extrabold tracking-[0.25em] text-emerald-800">{r.entry_code}</span>
          </div>
        )}

        {podeRetirar && (
          <button onClick={() => pedirRetirada.mutate()} disabled={pedirRetirada.isPending}
            className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] disabled:opacity-60">
            {pedirRetirada.isPending ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            {r.status === 'withdrawal_requested' ? 'Ver PIN de retirada' : 'Pedir retirada'}
          </button>
        )}

        {/* Card do estacionamento */}
        <div className="relative rounded-2xl overflow-hidden bg-white shadow-sm">
          {foto ? <img src={foto} alt="" className="w-full h-36 object-cover" /> : <div className="w-full h-24 bg-gray-100 flex items-center justify-center"><ParkingSquare size={32} className="text-gray-300" /></div>}
          <div className="p-4">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"><ParkingSquare size={11} /> Estacionamento</span>
            <p className="text-[16px] font-extrabold text-gray-900 mt-1">{lot?.name || r.lot_name || 'Estacionamento'}</p>
            <p className="text-[13px] text-gray-500 flex items-center gap-1.5 mt-1"><Clock size={13} className="text-brand" /> {dt(r.start_at)} → {dt(r.end_at)}</p>
            <p className="text-[13px] text-gray-500 flex items-center gap-1.5 mt-0.5 capitalize"><Car size={13} className="text-brand" /> {r.vehicle_type}{r.plate ? ` · ${r.plate}` : ''} · {r.units} diária(s)</p>
            <p className="text-[18px] font-extrabold text-gray-900 mt-2">{money(r.total_amount)}</p>
          </div>
        </div>

        {/* Progresso */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-gray-900 mb-3">Progresso da reserva</p>
          <div className="space-y-3">
            {passos.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${p.done ? 'bg-emerald-500 text-white' : p.atual ? 'bg-brand text-white' : 'bg-gray-200 text-gray-400'}`}>{p.done ? '✓' : i + 1}</span>
                <span className={`text-[14px] ${p.done ? 'text-gray-800 font-medium' : p.atual ? 'text-brand font-semibold' : 'text-gray-400'}`}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ações secundárias */}
        <div className="flex gap-2">
          {podeEstender && (
            <button onClick={() => navigate(`/estacionamento/${id}/estender`)} className="flex-1 border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-[13px] flex items-center justify-center gap-1.5"><Clock size={14} className="text-brand" /> Estender</button>
          )}
          {r.status === 'completed' && r.reviewed === false && (
            <button onClick={() => navigate('/minhas-reservas')} className="flex-1 border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-[13px]">Avaliar</button>
          )}
        </div>
        {podeCancelar && (
          <button onClick={() => navigate('/minhas-reservas')} className="w-full text-center text-[12px] font-semibold text-red-500 py-1.5">Cancelar reserva (em Minhas Reservas)</button>
        )}
      </main>

      {pin && <PinModal data={pin} onClose={() => setPin(null)} />}
    </div>
  )
}

function Contagem({ until, prefixo, expirado }) {
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id) }, [])
  if (!until) return null
  const ms = new Date(until).getTime() - Date.now()
  if (isNaN(ms)) return null
  if (ms <= 0) return <p className="mt-2 text-[12px] font-semibold text-red-500 text-center">{expirado}</p>
  const tS = Math.floor(ms / 1000), h = Math.floor(tS / 3600), m = Math.floor((tS % 3600) / 60), s = tS % 60
  const txt = h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  const urgente = ms < 5 * 60_000
  return (
    <div className={`mt-2 flex items-center justify-center gap-1.5 text-[12px] font-bold rounded-lg py-2 ${urgente ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
      <Clock size={13} /> {prefixo} <span className="font-mono tabular-nums">{txt}</span>
    </div>
  )
}

function PinModal({ data, onClose }) {
  const [restante, setRestante] = useState('')
  useEffect(() => {
    const alvo = data.expires_at ? new Date(data.expires_at).getTime() : 0
    const tick = () => {
      if (!alvo) return setRestante('')
      const s = Math.max(0, Math.round((alvo - Date.now()) / 1000))
      setRestante(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`)
    }
    tick(); const idt = setInterval(tick, 1000); return () => clearInterval(idt)
  }, [data.expires_at])
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-3"><KeyRound size={22} /></div>
        <h3 className="text-[16px] font-extrabold text-gray-900">PIN de retirada</h3>
        <p className="text-[12px] text-gray-500 mt-1">Mostre ao atendente. Uso único{restante ? ` · expira em ${restante}` : ''}.</p>
        <div className="my-5 font-mono text-[40px] font-black tracking-[0.3em] text-gray-900">{data.pin}</div>
        <button onClick={onClose} className="w-full bg-gray-900 text-white font-bold rounded-xl py-3 text-[14px]">Fechar</button>
      </div>
    </div>, document.body,
  )
}
