import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, FileText, AlertCircle, Loader2 } from 'lucide-react'
import { downloadOrderPDF } from '../lib/orderPDF'

// Página PÚBLICA da Ordem de Serviço, aberta pelo link enviado no WhatsApp do
// cliente e do motorista. Não exige login — eles não têm conta. O acesso é
// controlado pelo token assinado na URL (API: GET /api/os/:token).
//
// Substitui o envio do PDF como anexo pelo Z-API, que esbarrava no limite de
// tamanho do corpo. Aqui o arquivo é gerado no próprio aparelho de quem abre,
// no botão "Baixar PDF" — usando o MESMO gerador da cooperativa.
const BASE = import.meta.env.VITE_API_URL || ''

const fmtMoney = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function fmtDate(s) {
  if (!s) return '—'
  try { return format(new Date(s + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) }
  catch { return s }
}

// 0,25h -> "15 minutos" · 4,5h -> "4h30". Voo com pouso ocupa o dia; o
// motorista precisa disso para não marcar outra corrida em cima.
function fmtDuracao(h) {
  const n = Number(h)
  if (!n) return null
  if (n < 1) return `${Math.round(n * 60)} minutos`
  if (Number.isInteger(n)) return `${n} hora(s)`
  return `${Math.floor(n)}h${String(Math.round((n % 1) * 60)).padStart(2, '0')}`
}

function Linha({ label, children }) {
  if (!children) return null
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-[13px] text-gray-500 shrink-0">{label}</span>
      <span className="text-[13px] font-semibold text-gray-900 text-right">{children}</span>
    </div>
  )
}

export default function OsPublica() {
  const { token } = useParams()
  const [data, setData]   = useState(null)
  const [erro, setErro]   = useState('')
  const [baixando, setBaixando] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const res  = await fetch(`${BASE}/api/os/${token}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Não foi possível abrir esta Ordem de Serviço.')
        if (vivo) setData(json)
      } catch (e) {
        if (vivo) setErro(e?.message || 'Não foi possível abrir esta Ordem de Serviço.')
      }
    })()
    return () => { vivo = false }
  }, [token])

  async function baixar() {
    if (!data || baixando) return
    setBaixando(true)
    try {
      const { booking, assignment, cooperativa } = data
      await downloadOrderPDF(
        { ...booking, booking_vehicles: (data.vehicles || []).map((v) => ({
            quantity: v.quantity, vehicle_name_snapshot: v.vehicle_name_snapshot })) },
        {
          real_vehicle_text: assignment?.real_vehicle_text || '',
          driver_name:       assignment?.driver_name       || '',
          driver_phone:      assignment?.driver_phone      || '',
          dispatch_notes:    assignment?.dispatch_notes    || '',
        },
        cooperativa,
      )
    } catch {
      setErro('Não foi possível gerar o PDF neste aparelho.')
    } finally { setBaixando(false) }
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 max-w-sm w-full text-center">
          <AlertCircle size={28} className="text-red-500 mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-gray-900">{erro}</p>
          <p className="text-[12px] text-gray-500 mt-2">
            Peça um novo link à cooperativa.
          </p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={26} className="animate-spin text-brand" />
      </div>
    )
  }

  const { booking, assignment, cooperativa, vehicles } = data
  const veiculoCliente = (vehicles || [])
    .map((v) => `${v.quantity > 1 ? v.quantity + 'x ' : ''}${v.vehicle_name_snapshot || ''}`.trim())
    .filter(Boolean).join(' + ')
  const tipo = booking.service_type === 'transfer' ? 'Translado' : 'Passeio'
  const modo = booking.booking_mode === 'private' ? 'Privativo' : 'Compartilhado'

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Cabeçalho */}
      <div className="bg-brand text-white px-5 pt-8 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={16} />
          <span className="text-[12px] font-bold uppercase tracking-wider opacity-90">Ordem de Serviço</span>
        </div>
        <p className="text-[24px] font-extrabold leading-tight">{booking.booking_code}</p>
        {cooperativa?.name && (
          <p className="text-[13px] opacity-90 mt-1">{cooperativa.name}</p>
        )}
      </div>

      <div className="px-4 -mt-4 space-y-3">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Serviço</p>
          {booking.service_name && (
            <p className="text-[16px] font-bold text-gray-900 mb-1 leading-snug">{booking.service_name}</p>
          )}
          {/* Roteiro: quem lê a OS precisa saber por onde passa, não só o nome */}
          {booking.service_description && (
            <p className="text-[12px] text-gray-500 mb-2 leading-relaxed">{booking.service_description}</p>
          )}
          <Linha label="Tipo">{`${tipo} · ${modo}`}</Linha>
          <Linha label="Duração prevista">{fmtDuracao(booking.service_duration_hours)}</Linha>
          <Linha label="Data">{fmtDate(booking.service_date)}</Linha>
          <Linha label="Horário">{booking.service_time ? booking.service_time.slice(0, 5) : null}</Linha>
          <Linha label="Passageiros">{booking.people_count ? `${booking.people_count} pessoa(s)` : null}</Linha>
          <Linha label="Embarque">{booking.origin_text || booking.pickup_place_name}</Linha>
          <Linha label="Destino">{booking.destination_text || booking.destination_place_name}</Linha>
          <Linha label="Veículo contratado">{veiculoCliente}</Linha>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Atendimento</p>
          <Linha label="Veículo">{assignment?.real_vehicle_text}</Linha>
          <Linha label="Motorista">{assignment?.driver_name}</Linha>
          <Linha label="WhatsApp do motorista">{assignment?.driver_phone}</Linha>
          <Linha label="Observações">{assignment?.dispatch_notes}</Linha>
          {!assignment?.real_vehicle_text && !assignment?.driver_name && (
            <p className="text-[12px] text-gray-400 py-2">Ainda não despachado.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Cliente</p>
          <Linha label="Nome">{booking.users?.full_name}</Linha>
          <Linha label="Contato">{booking.users?.phone}</Linha>
          <Linha label="Valor total">{fmtMoney(booking.total_amount)}</Linha>
        </div>

        <p className="text-center text-[11px] text-gray-400 px-4 pt-1">
          Turiva — Plataforma de Passeios &amp; Transfers · Jericoacoara, CE
        </p>
      </div>

      {/* Baixar: gerado no próprio aparelho de quem abre o link */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
        <button
          onClick={baixar}
          disabled={baixando}
          className="w-full h-12 bg-brand text-white rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg shadow-brand/30 active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {baixando ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
          {baixando ? 'Gerando PDF…' : 'Baixar PDF'}
        </button>
      </div>
    </div>
  )
}
