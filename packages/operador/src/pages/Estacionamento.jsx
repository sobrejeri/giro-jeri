import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ParkingSquare, Clock, Car, Check, X, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const dt = (s) => { try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return s } }

const STATUS = {
  accepted_awaiting_payment: { label: 'Aguardando pagamento', cls: 'bg-amber-100 text-amber-700' },
  confirmed:                 { label: 'Confirmada',  cls: 'bg-emerald-100 text-emerald-700' },
  in_lot:                    { label: 'No pátio',    cls: 'bg-blue-100 text-blue-700' },
  completed:                 { label: 'Concluída',   cls: 'bg-gray-100 text-gray-600' },
}

// ── Painel do estacionamento (parceiro) — núcleo operacional ──────────────────
// Fila de solicitações (aceitar/recusar) e reservas em andamento. Entrada por
// QR e retirada com PIN vêm nas próximas fases.
export default function Estacionamento() {
  const qc = useQueryClient()
  const [aba, setAba] = useState('fila')     // 'fila' | 'reservas'
  const [toast, setToast] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['parking-partner'],
    queryFn:  () => api.parkingPartnerReservations(),
    refetchInterval: 10000,
  })

  const reservas = data?.data || []
  const fila     = reservas.filter((r) => r.status === 'awaiting_partner')
  const ativas   = reservas.filter((r) => ['accepted_awaiting_payment', 'confirmed', 'in_lot'].includes(r.status))

  const aceitar = useMutation({
    mutationFn: (id) => api.parkingAccept(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['parking-partner'] }); setToast({ t: 'ok', m: 'Solicitação aceita! Aguardando o cliente pagar.' }); setTimeout(() => setToast(null), 3000) },
    onError:    (e) => { setToast({ t: 'err', m: e?.message || 'Não foi possível aceitar.' }); setTimeout(() => setToast(null), 4000) },
  })
  const recusar = useMutation({
    mutationFn: (id) => api.parkingReject(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['parking-partner'] }) },
    onError:    (e) => { setToast({ t: 'err', m: e?.message || 'Não foi possível recusar.' }); setTimeout(() => setToast(null), 4000) },
  })

  if (isLoading) return <PageSpinner />

  const lista = aba === 'fila' ? fila : ativas

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ParkingSquare size={20} className="text-brand" />
        <h1 className="text-lg font-bold text-gray-900">Estacionamento</h1>
      </div>

      {/* Abas */}
      <div className="flex gap-2">
        <button onClick={() => setAba('fila')}
          className={`px-3.5 py-2 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 ${aba === 'fila' ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
          Solicitações <span className="text-[10px] px-1.5 rounded-full bg-gray-100">{fila.length}</span>
        </button>
        <button onClick={() => setAba('reservas')}
          className={`px-3.5 py-2 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 ${aba === 'reservas' ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
          Reservas <span className="text-[10px] px-1.5 rounded-full bg-gray-100">{ativas.length}</span>
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <ParkingSquare size={36} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm">{aba === 'fila' ? 'Nenhuma solicitação no momento.' : 'Nenhuma reserva ativa.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((r) => {
            const st = STATUS[r.status]
            const proc = aceitar.isPending || recusar.isPending
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-gray-400">{r.code}</span>
                  {st && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>}
                </div>
                <div className="mt-1.5 space-y-1 text-[13px] text-gray-700">
                  <p className="flex items-center gap-1.5"><Clock size={13} className="text-brand" /> {dt(r.start_at)} → {dt(r.end_at)}</p>
                  <p className="flex items-center gap-1.5 capitalize"><Car size={13} className="text-brand" /> {r.vehicle_type}{r.plate ? ` · ${r.plate}` : ''} · {r.units} diária(s)</p>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <span className="text-[15px] font-extrabold text-gray-900">{fmt(r.total_amount)}</span>
                  {r.status === 'awaiting_partner' && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => recusar.mutate(r.id)} disabled={proc}
                        className="flex items-center gap-1 text-[12px] font-semibold text-gray-500 border border-gray-200 rounded-lg px-3 py-2 active:scale-95 disabled:opacity-60">
                        <X size={13} /> Recusar
                      </button>
                      <button onClick={() => aceitar.mutate(r.id)} disabled={proc}
                        className="flex items-center gap-1 text-[12px] font-bold text-white bg-brand rounded-lg px-4 py-2 active:scale-95 disabled:opacity-60">
                        {proc ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Aceitar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] px-4">
          <div className={`rounded-xl px-4 py-3 text-[13px] font-semibold shadow-lg ${toast.t === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{toast.m}</div>
        </div>
      )}
    </div>
  )
}
