import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MessageCircle } from 'lucide-react'
import { api } from '../lib/api'
import Modal from './ui/Modal'
import Input, { Textarea, Select } from './ui/Input'
import Button from './ui/Button'
import { orderPDFBase64 } from '../lib/orderPDF'
import { TIPOS_PIX } from './ConfirmarExecutor'

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const FORM_VAZIO = {
  real_vehicle_text: '', driver_name: '', dispatch_notes: '', driver_phone: '',
  driver_document: '', driver_pix_key: '', driver_pix_key_type: '', driver_payout_amount: '',
}

// Uma fonte só de verdade para habilitar o botão e para o submit.
function podeDespachar(f) {
  return !!(
    f.real_vehicle_text.trim() && f.driver_name.trim() && f.driver_phone.trim() &&
    f.driver_document.trim() && f.driver_pix_key.trim() && f.driver_pix_key_type.trim()
  )
}

// Veículo(s) que o cliente escolheu na solicitação (ex.: "2x Buggy").
function veiculoDaReserva(b) {
  return (b?.booking_vehicles || [])
    .map((v) => `${v.quantity > 1 ? v.quantity + 'x ' : ''}${v.vehicle_name_snapshot || ''}`.trim())
    .filter(Boolean)
    .join(' + ')
}

// Modal de despacho compartilhado entre a tela Despacho e a tela Operações
// (Dashboard) — mesmas informações, campos e botões.
export default function DespacharModal({ booking, operador, onClose, onDone }) {
  const [form, setForm]     = useState(FORM_VAZIO)
  const [errMsg, setErrMsg] = useState('')

  const { data: executoresData } = useQuery({
    queryKey: ['executores'], queryFn: () => api.getExecutores(),
    staleTime: 5 * 60_000, retry: false,
  })
  const executores = Array.isArray(executoresData) ? executoresData : []

  useEffect(() => {
    if (!booking) return
    const assign = booking.operational_assignments?.[0]
    setForm({
      ...FORM_VAZIO,
      real_vehicle_text:    assign?.real_vehicle_text    || '',
      driver_name:          assign?.driver_name          || '',
      dispatch_notes:       assign?.dispatch_notes       || '',
      driver_phone:         assign?.driver_phone         || '',
      driver_document:      assign?.driver_document      || '',
      driver_pix_key:       assign?.driver_pix_key       || '',
      driver_pix_key_type:  assign?.driver_pix_key_type  || '',
      driver_payout_amount: assign?.driver_payout_amount != null ? String(assign.driver_payout_amount) : '',
    })
    setErrMsg('')
  }, [booking?.id])

  const assignMut = useMutation({
    mutationFn: ({ id, ...body }) => api.assignBooking(id, body),
    onSuccess:  (_data, vars) => {
      onDone?.()
      // OS em PDF sai em segundo plano — falha aqui não desfaz o despacho.
      const snapshot = booking
      const formSnap = { ...form, ...vars }
      ;(async () => {
        try {
          const pdf = await orderPDFBase64(snapshot, formSnap, operador)
          if (pdf) await api.sendOsPdf(vars.id, pdf)
        } catch (err) {
          console.warn('[despacho] envio do PDF da OS falhou:', err?.message)
        }
      })()
      onClose?.()
    },
    onError: (err) => setErrMsg(err?.message || 'Não foi possível despachar. Tente novamente.'),
  })

  function usarExecutor(ex) {
    if (!ex) return
    setForm((f) => ({
      ...f,
      driver_name:         ex.name         || '',
      driver_phone:        ex.phone        || f.driver_phone,
      driver_document:     ex.document     || '',
      driver_pix_key:      ex.pix_key      || '',
      driver_pix_key_type: ex.pix_key_type || '',
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!podeDespachar(form)) return
    // Combina veículo escolhido + placa digitada para a OS/PDF mostrarem os dois.
    const veic  = veiculoDaReserva(booking)
    const placa = form.real_vehicle_text.trim()
    const real_vehicle_text = (veic && !placa.toLowerCase().includes(veic.toLowerCase()))
      ? `${veic} · ${placa}` : placa
    assignMut.mutate({ id: booking.id, ...form, real_vehicle_text })
  }

  const canDispatch = podeDespachar(form)

  return (
    <Modal open={!!booking} onClose={onClose}
      title={`Despachar — ${booking?.booking_code || ''}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {booking && (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-200">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Resumo do serviço</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                booking.service_type === 'tour' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {booking.service_type === 'tour' ? 'Passeio' : 'Transfer'}
              </span>
            </div>
            <div className="px-4 py-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-500 shrink-0">Cliente</span>
                <span className="font-semibold text-gray-900 text-right">{booking.users?.full_name || '—'}</span>
              </div>
              {booking.users?.phone && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 shrink-0">Tel. cliente</span>
                  <a href={`https://wa.me/${(() => { const d = booking.users.phone.replace(/\D/g,''); return d.length <= 11 ? '55' + d : d })()}`}
                     target="_blank" rel="noreferrer"
                     className="font-medium text-green-600 hover:underline flex items-center gap-1">
                    <MessageCircle size={12} />{booking.users.phone}
                  </a>
                </div>
              )}
              {booking.service_date && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 shrink-0">Data</span>
                  <span className="font-medium text-gray-800 text-right">
                    {format(new Date(booking.service_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })}
                    {booking.service_time ? ` às ${booking.service_time.slice(0, 5)}` : ''}
                  </span>
                </div>
              )}
              {booking.people_count && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 shrink-0">Pessoas</span>
                  <span className="font-medium text-gray-800">{booking.people_count} pessoas</span>
                </div>
              )}
              {veiculoDaReserva(booking) && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 shrink-0">Veículo</span>
                  <span className="font-medium text-gray-800 text-right">{veiculoDaReserva(booking)}</span>
                </div>
              )}
              {(booking.pickup_place_name || booking.origin_text) && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 shrink-0">Embarque</span>
                  <span className="font-medium text-gray-800 text-right line-clamp-1">
                    {booking.pickup_place_name || booking.origin_text}
                  </span>
                </div>
              )}
              {(booking.destination_place_name || booking.destination_text) && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 shrink-0">Destino</span>
                  <span className="font-medium text-gray-800 text-right line-clamp-1">
                    {booking.destination_place_name || booking.destination_text}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-gray-100 mt-1">
                <span className="text-gray-500">Valor</span>
                <span className="font-extrabold text-brand text-base">{fmt(booking.total_amount)}</span>
              </div>
            </div>
          </div>
        )}

        <Input label="Placa do veículo *" placeholder="Ex: GKR-1234"
          value={form.real_vehicle_text} required
          onChange={(e) => setForm({ ...form, real_vehicle_text: e.target.value })} />

        {executores.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-gray-500 mb-1.5">Quem já rodou com vocês</p>
            <div className="flex flex-wrap gap-1.5">
              {executores.map((ex) => (
                <button key={ex.name} type="button" onClick={() => usarExecutor(ex)}
                  className={`px-2.5 py-1 rounded-full text-[12px] border transition-colors ${
                    form.driver_name === ex.name
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-brand hover:text-brand'
                  }`}>
                  {ex.name}{ex.pix_key ? '' : ' · sem PIX'}
                </button>
              ))}
            </div>
          </div>
        )}

        <Input label="Nome do motorista *" placeholder="Ex: João da Silva"
          value={form.driver_name} required
          onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp do motorista *</label>
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand bg-white">
            <MessageCircle size={14} className="text-green-500 shrink-0" />
            <input type="tel" placeholder="(88) 99999-9999" value={form.driver_phone} required
              onChange={(e) => setForm({ ...form, driver_phone: e.target.value })}
              className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400" />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2.5">
          <div>
            <p className="text-[12px] font-bold text-gray-800">Dados para o repasse</p>
            <p className="text-[11px] text-gray-500">Obrigatório — é para onde o admin manda o valor da corrida.</p>
          </div>
          <Input label="CPF / CNPJ de quem executa *" placeholder="000.000.000-00"
            value={form.driver_document}
            onChange={(e) => setForm({ ...form, driver_document: e.target.value })} />
          <div className="grid grid-cols-[1fr_9rem] gap-2">
            <Input label="Chave PIX *" placeholder="chave para receber"
              value={form.driver_pix_key}
              onChange={(e) => setForm({ ...form, driver_pix_key: e.target.value })} />
            <Select label="Tipo *" value={form.driver_pix_key_type}
              onChange={(e) => setForm({ ...form, driver_pix_key_type: e.target.value })}>
              {TIPOS_PIX.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <Input label="Valor do repasse ao motorista (opcional)" type="number" min={0} step="0.01"
            placeholder="Ex: 120,00 — pode definir depois"
            value={form.driver_payout_amount}
            onChange={(e) => setForm({ ...form, driver_payout_amount: e.target.value })} />
        </div>

        <Textarea label="Observações para o motorista" rows={2} value={form.dispatch_notes}
          onChange={(e) => setForm({ ...form, dispatch_notes: e.target.value })} />

        {!canDispatch && (
          <p className="text-[11px] text-amber-600">Preencha placa, motorista, WhatsApp e os dados de repasse (CPF/CNPJ, chave PIX e tipo). Só as observações são opcionais.</p>
        )}
        {errMsg && (
          <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errMsg}</p>
        )}
        <Button type="submit" className="w-full" disabled={assignMut.isPending || !canDispatch}>
          {assignMut.isPending ? 'Salvando…' : 'Confirmar Despacho'}
        </Button>
      </form>
    </Modal>
  )
}
