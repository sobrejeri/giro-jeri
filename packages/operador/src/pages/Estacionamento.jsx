import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ParkingSquare, Clock, Car, Check, X, Loader2, LogIn, KeyRound, Wallet, Settings, ImagePlus, Trash2, Plus, QrCode } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'

// Redimensiona a imagem no cliente antes de enviar (padrão das outras telas).
function fileToResizedDataUrl(file, max = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, max / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

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
  const [aba, setAba] = useState('inicio')   // 'inicio' | 'fila' | 'reservas' | 'patio' | 'financeiro' | 'meulocal'
  const [toast, setToast] = useState(null)
  const notify = (t, m, ms = 3500) => { setToast({ t, m }); setTimeout(() => setToast(null), ms) }

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ParkingSquare size={20} className="text-brand" />
        <h1 className="text-lg font-bold text-gray-900">Estacionamento</h1>
      </div>

      {/* Abas */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setAba('inicio')}
          className={`px-3.5 py-2 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 ${aba === 'inicio' ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
          Início
        </button>
        <button onClick={() => setAba('fila')}
          className={`px-3.5 py-2 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 ${aba === 'fila' ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
          Solicitações <span className="text-[10px] px-1.5 rounded-full bg-gray-100">{fila.length}</span>
        </button>
        <button onClick={() => setAba('reservas')}
          className={`px-3.5 py-2 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 ${aba === 'reservas' ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
          Reservas <span className="text-[10px] px-1.5 rounded-full bg-gray-100">{ativas.length}</span>
        </button>
        <button onClick={() => setAba('patio')}
          className={`px-3.5 py-2 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 ${aba === 'patio' ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
          Pátio
        </button>
        <button onClick={() => setAba('financeiro')}
          className={`px-3.5 py-2 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 ${aba === 'financeiro' ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
          Financeiro
        </button>
        <button onClick={() => setAba('meulocal')}
          className={`px-3.5 py-2 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 ${aba === 'meulocal' ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
          <Settings size={13} /> Meu local
        </button>
      </div>

      {aba === 'inicio' ? (
        <InicioDashboard onGo={setAba} filaCount={fila.length} />
      ) : aba === 'patio' ? (
        <PatioView notify={notify} onDone={() => qc.invalidateQueries({ queryKey: ['parking-partner'] })} />
      ) : aba === 'financeiro' ? (
        <FinanceiroParking />
      ) : aba === 'meulocal' ? (
        <MeuEstacionamento notify={notify} />
      ) : aba === 'fila' ? (
        <SolicitacoesView reservas={reservas} aceitar={aceitar} recusar={recusar} />
      ) : (
        <ReservasView reservas={reservas} />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] px-4">
          <div className={`rounded-xl px-4 py-3 text-[13px] font-semibold shadow-lg ${toast.t === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{toast.m}</div>
        </div>
      )}
    </div>
  )
}

// ── Financeiro do estacionamento (apuração; não transfere dinheiro) ───────────
function FinanceiroParking() {
  const [periodo, setPeriodo] = useState('mes') // 'mes' | '30d' | 'tudo'
  const range = () => {
    const now = new Date()
    if (periodo === 'mes') {
      const ini = new Date(now.getFullYear(), now.getMonth(), 1)
      return `?from=${ini.toISOString()}`
    }
    if (periodo === '30d') {
      const ini = new Date(Date.now() - 30 * 864e5)
      return `?from=${ini.toISOString()}`
    }
    return ''
  }
  const { data, isLoading } = useQuery({
    queryKey: ['parking-financial', periodo],
    queryFn:  () => api.parkingFinancial(range()),
  })
  const money = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  if (isLoading) return <PageSpinner />
  const r = data?.resumo || { bruto: 0, comissao: 0, liquido: 0, qtd: 0 }

  const TABS = [['mes', 'Este mês'], ['30d', 'Últimos 30d'], ['tudo', 'Tudo']]
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setPeriodo(id)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${periodo === id ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] font-semibold text-gray-400 flex items-center gap-1.5"><Wallet size={13} className="text-brand" /> Seu líquido</p>
          <p className="text-[22px] font-extrabold text-gray-900 mt-1">{money(r.liquido)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] font-semibold text-gray-400">Reservas pagas</p>
          <p className="text-[22px] font-extrabold text-gray-900 mt-1">{r.qtd}</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-1.5 text-[13px]">
        <div className="flex items-center justify-between"><span className="text-gray-500">Bruto cobrado</span><span className="font-semibold text-gray-900">{money(r.bruto)}</span></div>
        <div className="flex items-center justify-between"><span className="text-gray-500">Comissão da plataforma</span><span className="font-semibold text-gray-600">− {money(r.comissao)}</span></div>
        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100"><span className="font-semibold text-gray-700">Repasse líquido</span><span className="font-extrabold text-emerald-600">{money(r.liquido)}</span></div>
      </div>

      {(data?.por_lot || []).length > 1 && (
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-gray-500">Por estacionamento</p>
          {data.por_lot.map((l) => (
            <div key={l.lot_id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between">
              <div><p className="text-[13px] font-semibold text-gray-900">{l.name}</p><p className="text-[11px] text-gray-400">{l.qtd} reserva(s)</p></div>
              <span className="text-[14px] font-extrabold text-emerald-600">{money(l.liquido)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400 text-center">Apuração informativa. Os repasses são processados conforme o combinado da plataforma.</p>
    </div>
  )
}

// ── Meu local: o parceiro completa/edita o próprio cadastro ───────────────────
// Admin provisiona a casca; aqui o dono preenche fotos, descrição, capacidade e
// tarifas. Comissão/prazos/reembolso são da plataforma (só leitura).
function MeuEstacionamento({ notify }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['parking-my-lots'], queryFn: () => api.parkingMyLots() })
  const lots = data?.data || []
  if (isLoading) return <PageSpinner />
  if (lots.length === 0) return (
    <div className="py-16 text-center text-gray-400">
      <ParkingSquare size={36} className="mx-auto mb-2 text-gray-200" />
      <p className="text-sm">Nenhum estacionamento vinculado à sua conta.</p>
      <p className="text-[12px] mt-1">Peça ao administrador para criar/vincular seu estabelecimento.</p>
    </div>
  )
  return (
    <div className="space-y-5">
      {lots.map((lot) => <LotEditor key={lot.id} lot={lot} notify={notify}
        onSaved={() => qc.invalidateQueries({ queryKey: ['parking-my-lots'] })} />)}
    </div>
  )
}

function LotEditor({ lot, notify, onSaved }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: lot.name || '', description: lot.description || '', capacity: lot.capacity ?? 0,
    photos: lot.photos || [], is_active: lot.is_active !== false,
  })
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const salvar = useMutation({
    mutationFn: () => api.parkingUpdateMyLot(lot.id, {
      name: form.name.trim(), description: form.description.trim() || null,
      capacity: Number(form.capacity), photos: form.photos, is_active: !!form.is_active,
    }),
    onSuccess: () => { notify?.('ok', 'Cadastro atualizado!'); onSaved?.() },
    onError: (e) => notify?.('err', e?.message || 'Não foi possível salvar.'),
  })

  async function onPickPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { notify?.('err', 'Use JPEG, PNG ou WebP.'); e.target.value = ''; return }
    setEnviandoFoto(true)
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      const { url } = await api.uploadSiteImage(dataUrl, 'estacionamento')
      setForm((f) => ({ ...f, photos: [...(f.photos || []), url].slice(0, 10) }))
    } catch (err) { notify?.('err', err?.message || 'Falha ao enviar a imagem.') }
    finally { setEnviandoFoto(false); e.target.value = '' }
  }

  const campo = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand'
  const label = 'block text-[12px] font-semibold text-gray-500 mb-1'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div>
        <label className={label}>Nome</label>
        <input value={form.name} onChange={(e) => setF('name', e.target.value)} className={campo} />
      </div>
      <div>
        <label className={label}>Descrição</label>
        <textarea value={form.description} onChange={(e) => setF('description', e.target.value)} rows={2}
          className={`${campo} resize-none`} placeholder="Conte como é o seu estacionamento, segurança, cobertura…" />
      </div>
      <div>
        <label className={label}>Fotos</label>
        <div className="flex flex-wrap gap-2">
          {(form.photos || []).map((url, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-100">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))}
                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><Trash2 size={12} /></button>
            </div>
          ))}
          {(form.photos || []).length < 10 && (
            <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer text-gray-400 hover:border-brand hover:text-brand">
              {enviandoFoto ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickPhoto} />
            </label>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Capacidade (vagas)</label><input type="number" min="0" value={form.capacity} onChange={(e) => setF('capacity', e.target.value)} className={campo} /></div>
        <label className="flex items-end gap-2 text-sm text-gray-700 pb-2.5">
          <input type="checkbox" checked={!!form.is_active} onChange={(e) => setF('is_active', e.target.checked)} /> Ativo (aparece pros clientes)
        </label>
      </div>

      {/* Campos da plataforma — só leitura */}
      <div className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
        Definidos pela plataforma: comissão {lot.commission_pct}% · prazo de aceite {lot.accept_deadline_min}min · pagamento {lot.payment_deadline_min}min
      </div>

      <button onClick={() => salvar.mutate()} disabled={salvar.isPending || !form.name.trim()}
        className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-50">
        {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar cadastro
      </button>

      <TarifasDoParceiro lot={lot} notify={notify} onChange={() => qc.invalidateQueries({ queryKey: ['parking-my-lots'] })} />
    </div>
  )
}

function TarifasDoParceiro({ lot, notify, onChange }) {
  const [nova, setNova] = useState({ vehicle_type: '', price_per_unit: '' })
  const tarifas = (lot.parking_tariffs || []).filter((t) => t.is_active !== false)
  const add = useMutation({
    mutationFn: () => api.parkingAddMyTariff(lot.id, { vehicle_type: nova.vehicle_type.trim(), price_per_unit: Number(nova.price_per_unit), hours_per_unit: 24, min_units: 1 }),
    onSuccess: () => { setNova({ vehicle_type: '', price_per_unit: '' }); onChange?.() },
    onError: (e) => notify?.('err', e?.message || 'Não foi possível adicionar.'),
  })
  const remover = useMutation({
    mutationFn: (id) => api.parkingUpdateMyTariff(id, { is_active: false }),
    onSuccess: () => onChange?.(),
  })
  const money = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="text-[12px] font-semibold text-gray-500 mb-2">Tarifas por veículo</p>
      <div className="space-y-1.5 mb-2">
        {tarifas.length === 0 && <p className="text-[12px] text-amber-600">Adicione ao menos uma tarifa para começar a receber reservas.</p>}
        {tarifas.map((t) => (
          <div key={t.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
            <span className="capitalize text-gray-700">{t.vehicle_type} · {money(t.price_per_unit)} / diária</span>
            <button onClick={() => remover.mutate(t.id)} className="text-red-400 hover:text-red-600"><X size={15} /></button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={nova.vehicle_type} onChange={(e) => setNova((n) => ({ ...n, vehicle_type: e.target.value }))} placeholder="Veículo (ex.: carro)" className="border border-gray-200 rounded-lg px-3 h-9 text-sm outline-none focus:border-brand" />
        <input value={nova.price_per_unit} onChange={(e) => setNova((n) => ({ ...n, price_per_unit: e.target.value }))} inputMode="decimal" placeholder="Preço/diária" className="border border-gray-200 rounded-lg px-3 h-9 text-sm outline-none focus:border-brand" />
      </div>
      <button onClick={() => add.mutate()} disabled={!nova.vehicle_type.trim() || !nova.price_per_unit || add.isPending}
        className="mt-2 w-full flex items-center justify-center gap-2 border border-brand text-brand font-semibold rounded-lg py-2 text-sm disabled:opacity-50">
        {add.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar tarifa
      </button>
    </div>
  )
}

// Helpers de dinheiro/data/financeiro compartilhados pelas views.
const money = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const dtBR = (s) => { try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return s } }
function financeiro(r) {
  const bruto = Number(r.total_amount || 0)
  const comissao = Math.round(bruto * Number(r.commission_pct || 0)) / 100
  return { bruto, comissao, liquido: Math.round((bruto - comissao) * 100) / 100 }
}

// ── Solicitações: Novas / Aceitas / Recusadas + análise ───────────────────────
function SolicitacoesView({ reservas, aceitar, recusar }) {
  const [sub, setSub] = useState('novas')
  const [analise, setAnalise] = useState(null)
  const grupos = {
    novas: reservas.filter((r) => r.status === 'awaiting_partner'),
    aceitas: reservas.filter((r) => ['accepted_awaiting_payment', 'confirmed', 'in_lot'].includes(r.status)),
    recusadas: reservas.filter((r) => ['rejected', 'expired_no_answer', 'expired_no_payment', 'cancelled'].includes(r.status)),
  }
  const lista = grupos[sub]
  const TABS = [['novas', 'Novas'], ['aceitas', 'Aceitas'], ['recusadas', 'Recusadas']]
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${sub === id ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
            {label} <span className="text-[10px] px-1.5 rounded-full bg-gray-100">{grupos[id].length}</span>
          </button>
        ))}
      </div>
      {lista.length === 0 ? <p className="text-[13px] text-gray-400 py-10 text-center">Nada aqui.</p> : (
        <div className="space-y-2">
          {lista.map((r) => {
            const st = STATUS[r.status] || { label: r.status, cls: 'bg-gray-100 text-gray-600' }
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-gray-400">{r.code}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-[13px] text-gray-800 font-semibold mt-1">{r.user_name || 'Cliente'}</p>
                <div className="mt-1 space-y-1 text-[13px] text-gray-600">
                  <p className="flex items-center gap-1.5"><Clock size={13} className="text-brand" /> {dtBR(r.start_at)} → {dtBR(r.end_at)}</p>
                  <p className="flex items-center gap-1.5 capitalize"><Car size={13} className="text-brand" /> {r.vehicle_type}{r.plate ? ` · ${r.plate}` : ''} · {r.units} diária(s)</p>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <span className="text-[15px] font-extrabold text-gray-900">{money(r.total_amount)}</span>
                  {r.status === 'awaiting_partner' && (
                    <button onClick={() => setAnalise(r)} className="text-[12px] font-bold text-white bg-brand rounded-lg px-4 py-2 active:scale-95">Analisar</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {analise && <AnaliseModal reserva={analise} aceitar={aceitar} recusar={recusar} onClose={() => setAnalise(null)} />}
    </div>
  )
}

function AnaliseModal({ reserva: r, aceitar, recusar, onClose }) {
  const f = financeiro(r)
  const proc = aceitar.isPending || recusar.isPending
  const fechar = () => onClose()
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={fechar}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Analisar solicitação</h2>
          <button onClick={fechar} className="p-2 text-gray-400"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="space-y-1 text-[13px] text-gray-700">
            <p className="text-[15px] font-bold text-gray-900">{r.user_name || 'Cliente'}</p>
            <p className="flex items-center gap-1.5"><Clock size={13} className="text-brand" /> {dtBR(r.start_at)} → {dtBR(r.end_at)} · {r.units} diária(s)</p>
            <p className="flex items-center gap-1.5 capitalize"><Car size={13} className="text-brand" /> {r.vehicle_type}{r.plate ? ` · ${r.plate}` : ''}</p>
          </div>
          <div className="rounded-2xl bg-gray-50 p-3 text-[13px] space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Valor da reserva</span><span className="font-semibold text-gray-800">{money(f.bruto)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Comissão da plataforma ({r.commission_pct || 0}%)</span><span className="text-gray-600">− {money(f.comissao)}</span></div>
            <div className="flex justify-between pt-1 border-t border-gray-200"><span className="font-semibold text-gray-700">Valor líquido pra você</span><span className="font-extrabold text-emerald-600">{money(f.liquido)}</span></div>
          </div>
          <p className="text-[11px] text-gray-400">Ao aceitar, a vaga fica bloqueada para o cliente pagar dentro do prazo.</p>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={() => { recusar.mutate(r.id); fechar() }} disabled={proc}
            className="flex-1 flex items-center justify-center gap-1 border border-gray-200 text-gray-600 font-semibold rounded-xl py-2.5 text-sm"><X size={15} /> Recusar</button>
          <button onClick={() => { aceitar.mutate(r.id); fechar() }} disabled={proc}
            className="flex-1 flex items-center justify-center gap-1 bg-brand text-white font-bold rounded-xl py-2.5 text-sm">{proc ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Aceitar</button>
        </div>
      </div>
    </div>
  )
}

// ── Reservas: Todas / A pagar / Confirmadas / Concluídas + detalhe ────────────
function ReservasView({ reservas }) {
  const [filtro, setFiltro] = useState('todas')
  const [detalhe, setDetalhe] = useState(null)
  const grupos = {
    todas: reservas.filter((r) => r.status !== 'awaiting_partner'),
    apagar: reservas.filter((r) => r.status === 'accepted_awaiting_payment'),
    confirmadas: reservas.filter((r) => ['confirmed', 'in_lot'].includes(r.status)),
    concluidas: reservas.filter((r) => r.status === 'completed'),
  }
  const lista = grupos[filtro]
  const TABS = [['todas', 'Todas'], ['apagar', 'A pagar'], ['confirmadas', 'Confirmadas'], ['concluidas', 'Concluídas']]
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setFiltro(id)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${filtro === id ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
            {label} <span className="text-[10px] px-1.5 rounded-full bg-gray-100">{grupos[id].length}</span>
          </button>
        ))}
      </div>
      {lista.length === 0 ? <p className="text-[13px] text-gray-400 py-10 text-center">Nenhuma reserva.</p> : (
        <div className="space-y-2">
          {lista.map((r) => {
            const st = STATUS[r.status] || { label: r.status, cls: 'bg-gray-100 text-gray-600' }
            return (
              <button key={r.id} onClick={() => setDetalhe(r)} className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 active:scale-[0.99]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-brand">{r.code}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-[13px] font-semibold text-gray-800 mt-1">{r.user_name || 'Cliente'}</p>
                <div className="flex items-center justify-between mt-1 text-[12px] text-gray-500">
                  <span>{dtBR(r.start_at)} → {dtBR(r.end_at)}</span>
                  <span className="font-bold text-gray-900">{money(r.total_amount)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {detalhe && <ReservaDetalhe reserva={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  )
}

function ReservaDetalhe({ reserva: r, onClose }) {
  const f = financeiro(r)
  const passos = [
    { label: 'Solicitação', at: r.created_at, done: true },
    { label: 'Aceite', at: r.accepted_at, done: !!r.accepted_at || ['accepted_awaiting_payment', 'confirmed', 'in_lot', 'completed'].includes(r.status) },
    { label: 'Pagamento', at: null, done: r.payment_status === 'paid' },
    { label: 'Entrada', at: r.entered_at, done: !!r.entered_at || ['in_lot', 'completed'].includes(r.status) },
    { label: 'Concluída', at: r.completed_at, done: r.status === 'completed' },
  ]
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">Reserva {r.code}</h2>
          <button onClick={onClose} className="p-2 text-gray-400"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1 text-[13px] text-gray-700">
            <p className="text-[15px] font-bold text-gray-900">{r.user_name || 'Cliente'}</p>
            <p className="flex items-center gap-1.5"><Clock size={13} className="text-brand" /> {dtBR(r.start_at)} → {dtBR(r.end_at)} · {r.units} diária(s)</p>
            <p className="flex items-center gap-1.5 capitalize"><Car size={13} className="text-brand" /> {r.vehicle_type}{r.plate ? ` · ${r.plate}` : ''}</p>
          </div>
          <div className="rounded-2xl bg-gray-50 p-3 text-[13px] space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Valor</span><span className="font-semibold">{money(f.bruto)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Comissão ({r.commission_pct || 0}%)</span><span>− {money(f.comissao)}</span></div>
            <div className="flex justify-between pt-1 border-t border-gray-200"><span className="font-semibold text-gray-700">Líquido</span><span className="font-extrabold text-emerald-600">{money(f.liquido)}</span></div>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-gray-500 mb-2">Linha do tempo</p>
            <div className="space-y-2">
              {passos.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px]">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${p.done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'}`}>{p.done ? '✓' : i + 1}</span>
                  <span className={p.done ? 'text-gray-800 font-medium' : 'text-gray-400'}>{p.label}</span>
                  {p.at && <span className="ml-auto text-[11px] text-gray-400">{dtBR(p.at)}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Início: visão geral do estacionamento (dashboard) ─────────────────────────
function InicioDashboard({ onGo, filaCount }) {
  const { data: ov } = useQuery({ queryKey: ['parking-overview'], queryFn: () => api.parkingOverview(), refetchInterval: 20000 })
  const { data: pt } = useQuery({ queryKey: ['parking-patio'], queryFn: () => api.parkingPatio(), refetchInterval: 20000 })
  const s = ov?.stats || { no_patio: 0, capacity: 0, livres: 0, entradas_hoje: 0, saidas_hoje: 0 }
  const patio = pt?.no_patio || []
  const dt = (x) => { try { return new Date(x).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return x } }

  const Card = ({ icon: Icon, tint, big, label }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tint}`}><Icon size={20} /></div>
      <div><p className="text-[20px] font-extrabold text-gray-900 leading-none">{big}</p><p className="text-[11px] text-gray-400 mt-1">{label}</p></div>
    </div>
  )
  return (
    <div className="space-y-4">
      {ov?.lot && <p className="text-[13px] text-gray-500">{ov.lot.name}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Card icon={Car} tint="bg-blue-50 text-blue-600" big={`${s.no_patio}`} label="No pátio" />
        <Card icon={ParkingSquare} tint="bg-emerald-50 text-emerald-600" big={`${s.livres} de ${s.capacity}`} label="Vagas livres agora" />
        <Card icon={LogIn} tint="bg-indigo-50 text-indigo-600" big={`${s.entradas_hoje}`} label="Entradas previstas hoje" />
        <Card icon={Clock} tint="bg-orange-50 text-orange-600" big={`${s.saidas_hoje}`} label="Saídas previstas hoje" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onGo('patio')} className="bg-brand text-white rounded-2xl p-4 text-left active:scale-[0.99]">
          <LogIn size={20} /><p className="font-bold text-[14px] mt-2">Registrar entrada</p><p className="text-[11px] text-white/80">Código ou balcão</p>
        </button>
        <button onClick={() => onGo('patio')} className="bg-white border border-brand text-brand rounded-2xl p-4 text-left active:scale-[0.99]">
          <KeyRound size={20} /><p className="font-bold text-[14px] mt-2">Liberar retirada</p><p className="text-[11px] text-brand/70">Validar PIN do cliente</p>
        </button>
      </div>

      <button onClick={() => onGo('fila')} className="w-full flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm p-4 active:scale-[0.99]">
        <span className="font-semibold text-gray-800 text-[14px]">Solicitações pendentes</span>
        <span className="text-[12px] font-bold text-white bg-brand rounded-full px-2.5 py-0.5">{filaCount}</span>
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="font-bold text-gray-900 text-[14px] mb-2 flex items-center gap-2"><Car size={16} className="text-brand" /> Veículos no pátio ({patio.length})</p>
        {patio.length === 0 ? <p className="text-[13px] text-gray-400 py-4 text-center">Nenhum veículo no pátio.</p> : (
          <div className="space-y-1.5">
            {patio.slice(0, 6).map((v) => (
              <div key={v.id} className="flex items-center justify-between text-[13px] border-b border-gray-50 pb-1.5">
                <div><span className="font-mono font-semibold text-gray-800">{v.plate || '—'}</span> <span className="text-gray-500">{v.client_name || ''}</span></div>
                <span className="text-[11px] text-gray-400">{v.spot ? `Vaga ${v.spot} · ` : ''}{dt(v.entered_at)}</span>
              </div>
            ))}
            {patio.length > 6 && <button onClick={() => onGo('patio')} className="text-[12px] text-brand font-semibold pt-1">Ver todos →</button>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Pátio: lista de veículos + entrada presencial + balcão (código/PIN) ───────
function PatioView({ notify, onDone }) {
  const qc = useQueryClient()
  const [walkin, setWalkin] = useState(false)
  const { data: pt } = useQuery({ queryKey: ['parking-patio'], queryFn: () => api.parkingPatio(), refetchInterval: 15000 })
  const noPatio = pt?.no_patio || []
  const saidas = pt?.saidas_hoje || []
  const [verSaidas, setVerSaidas] = useState(false)
  const refresh = () => { qc.invalidateQueries({ queryKey: ['parking-patio'] }); qc.invalidateQueries({ queryKey: ['parking-overview'] }); onDone?.() }
  const dt = (x) => { try { return new Date(x).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return x } }
  const money = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

  const sair = useMutation({ mutationFn: (id) => api.parkingStayExit(id), onSuccess: () => { notify?.('ok', 'Saída registrada.'); refresh() }, onError: (e) => notify?.('err', e?.message || 'Erro ao registrar saída.') })
  const pagar = useMutation({ mutationFn: (id) => api.parkingStayMarkPaid(id), onSuccess: () => { notify?.('ok', 'Marcado como pago.'); refresh() }, onError: (e) => notify?.('err', e?.message) })

  const lista = verSaidas ? saidas : noPatio
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setVerSaidas(false)} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${!verSaidas ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>No pátio ({noPatio.length})</button>
        <button onClick={() => setVerSaidas(true)} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${verSaidas ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>Saídas hoje ({saidas.length})</button>
        <button onClick={() => setWalkin(true)} className="ml-auto flex items-center gap-1.5 bg-brand text-white font-semibold rounded-full px-3 py-1.5 text-[12px] active:scale-95"><Plus size={13} /> Entrada presencial</button>
      </div>

      {lista.length === 0 ? (
        <p className="text-[13px] text-gray-400 py-8 text-center">{verSaidas ? 'Nenhuma saída hoje.' : 'Nenhum veículo no pátio.'}</p>
      ) : (
        <div className="space-y-2">
          {lista.map((v) => (
            <div key={v.id} className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between">
                <div><span className="font-mono font-bold text-gray-900">{v.plate || '—'}</span> <span className="text-[13px] text-gray-500">{v.client_name || ''}</span></div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{v.origin === 'walkin' ? 'Balcão' : 'Turiva'}</span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[12px] text-gray-500">
                <span>{v.spot ? `Vaga ${v.spot} · ` : ''}Entrada {dt(v.entered_at)}</span>
                {v.amount != null && <span className={v.payment_status === 'paid' ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>{money(v.amount)} · {v.payment_status === 'paid' ? 'pago' : 'pendente'}</span>}
              </div>
              {!verSaidas && (
                <div className="flex gap-2 mt-2">
                  {v.origin === 'walkin' && v.payment_status !== 'paid' && (
                    <button onClick={() => pagar.mutate(v.id)} disabled={pagar.isPending} className="flex-1 text-[12px] font-semibold text-brand border border-brand rounded-lg py-1.5">Marcar pago</button>
                  )}
                  {v.origin === 'walkin' && (
                    <button onClick={() => sair.mutate(v.id)} disabled={sair.isPending} className="flex-1 text-[12px] font-semibold text-white bg-gray-900 rounded-lg py-1.5">Registrar saída</button>
                  )}
                  {v.origin !== 'walkin' && <span className="text-[11px] text-gray-400 py-1.5">Saída pelo PIN do cliente (abaixo)</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Balcão: entrada por código + retirada por PIN */}
      <PatioBalcao notify={notify} onDone={refresh} />

      {walkin && <WalkinModal notify={notify} onClose={() => setWalkin(false)} onDone={() => { setWalkin(false); refresh() }} />}
    </div>
  )
}

// Modal de entrada presencial (walk-in) — cobrança pela plataforma (liquidação
// presencial: dinheiro/pix no balcão, entra no repasse).
function WalkinModal({ notify, onClose, onDone }) {
  const { data: lotsData } = useQuery({ queryKey: ['parking-partner-lots'], queryFn: () => api.parkingPartnerLots() })
  const lots = lotsData?.data || []
  const [f, setF] = useState({ lot_id: '', client_name: '', client_phone: '', vehicle_type: 'carro', plate: '', spot: '', dias: 1, amount: '', payment_status: 'paid' })
  const lot = f.lot_id || (lots.length === 1 ? lots[0].id : '')
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }))

  const salvar = useMutation({
    mutationFn: () => {
      const start = new Date()
      const end = new Date(start.getTime() + Number(f.dias || 1) * 24 * 3600_000)
      const iso = (d) => `${new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19)}-03:00`
      return api.parkingWalkin({
        lot_id: lot, client_name: f.client_name.trim(), client_phone: f.client_phone.trim() || null,
        vehicle_type: f.vehicle_type.trim(), plate: f.plate.trim() || null, spot: f.spot.trim() || null,
        start_at: iso(start), end_at: iso(end), amount: Number(f.amount), payment_status: f.payment_status,
      })
    },
    onSuccess: () => { notify?.('ok', 'Entrada presencial registrada.'); onDone?.() },
    onError: (e) => notify?.('err', e?.message || 'Não foi possível registrar.'),
  })

  const campo = 'w-full border border-gray-200 rounded-xl px-3 h-10 text-sm outline-none focus:border-brand'
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">Entrada presencial</h2>
          <button onClick={onClose} className="p-2 text-gray-400"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          {lots.length > 1 && (
            <select value={lot} onChange={(e) => set('lot_id', e.target.value)} className={campo}>
              <option value="">Selecione o estacionamento…</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <input value={f.client_name} onChange={(e) => set('client_name', e.target.value)} placeholder="Nome do cliente" className={campo} />
          <div className="grid grid-cols-2 gap-2">
            <input value={f.client_phone} onChange={(e) => set('client_phone', e.target.value)} placeholder="Telefone" className={campo} />
            <input value={f.plate} onChange={(e) => set('plate', e.target.value)} placeholder="Placa" className={`${campo} uppercase`} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input value={f.vehicle_type} onChange={(e) => set('vehicle_type', e.target.value)} placeholder="Veículo" className={campo} />
            <input value={f.spot} onChange={(e) => set('spot', e.target.value)} placeholder="Vaga" className={campo} />
            <input value={f.dias} onChange={(e) => set('dias', e.target.value)} inputMode="numeric" placeholder="Diárias" className={campo} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={f.amount} onChange={(e) => set('amount', e.target.value)} inputMode="decimal" placeholder="Valor combinado (R$)" className={campo} />
            <select value={f.payment_status} onChange={(e) => set('payment_status', e.target.value)} className={campo}>
              <option value="paid">Pago (balcão)</option>
              <option value="pending">Pendente</option>
            </select>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-sm">Cancelar</button>
          <button onClick={() => salvar.mutate()} disabled={salvar.isPending || !lot || !f.client_name.trim() || !f.amount}
            className="flex-1 flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-50">
            {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

// Botão de leitura de QR (usa BarcodeDetector nativo; some onde não há suporte,
// ex.: iOS Safari — aí o código é digitado à mão, que sempre funciona).
function ScanQRButton({ onDetected }) {
  const [aberto, setAberto] = useState(false)
  const suporta = typeof window !== 'undefined' && 'BarcodeDetector' in window
  if (!suporta) return null
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className="shrink-0 w-11 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 active:scale-95" aria-label="Escanear QR">
        <QrCode size={18} />
      </button>
      {aberto && <QRScannerModal onClose={() => setAberto(false)} onDetected={(v) => { setAberto(false); onDetected?.(v) }} />}
    </>
  )
}

function QRScannerModal({ onClose, onDetected }) {
  const videoRef = useRef(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let stream, raf, parado = false, detector
    async function start() {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (parado) return
        const v = videoRef.current
        if (v) { v.srcObject = stream; await v.play() }
        const tick = async () => {
          if (parado || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes && codes[0]?.rawValue) { onDetected(codes[0].rawValue); return }
          } catch { /* frame sem leitura */ }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch (e) { setErro('Não foi possível abrir a câmera.') }
    }
    start()
    return () => { parado = true; if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()) }
  }, [onDetected])
  return (
    <div className="fixed inset-0 z-[95] bg-black/80 flex flex-col items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-4 text-center" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-gray-900 mb-2">Escanear QR da reserva</p>
        {erro ? <p className="text-[13px] text-red-500 py-8">{erro}</p> : (
          <video ref={videoRef} className="w-full rounded-xl bg-black aspect-square object-cover" muted playsInline />
        )}
        <button onClick={onClose} className="mt-3 w-full border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-sm">Cancelar</button>
      </div>
    </div>
  )
}

// ── Balcão do pátio: registrar entrada (código) e validar retirada (PIN) ──────
// O PIN é um segredo do cliente — o parceiro só digita o que o cliente mostra;
// nada do PIN é exibido ou guardado aqui.
function PatioBalcao({ notify, onDone }) {
  const [lotId, setLotId] = useState('')
  const [code, setCode]   = useState('')
  const [plate, setPlate] = useState('')
  const [spot, setSpot]   = useState('')
  const [pin, setPin]     = useState('')

  const { data: lotsData, isLoading } = useQuery({
    queryKey: ['parking-partner-lots'],
    queryFn:  () => api.parkingPartnerLots(),
  })
  const lots = lotsData?.data || []
  const lot  = lotId || (lots.length === 1 ? lots[0].id : '')

  const entrada = useMutation({
    mutationFn: () => api.parkingRegisterEntry({ lot_id: lot, code: code.trim().toUpperCase(), plate: plate.trim() || null, spot: spot.trim() || null }),
    onSuccess: (r) => { notify('ok', r?.already ? 'Veículo já estava no pátio.' : `Entrada registrada (${r?.code || ''}).`); setCode(''); setPlate(''); setSpot(''); onDone?.() },
    onError:   (e) => notify('err', e?.message || 'Não foi possível registrar a entrada.'),
  })
  const retirada = useMutation({
    mutationFn: () => api.parkingValidateWithdrawal({ lot_id: lot, pin: pin.trim() }),
    onSuccess: (r) => { notify('ok', `Retirada liberada (${r?.code || ''}). Boa viagem!`); setPin(''); onDone?.() },
    onError:   (e) => notify('err', e?.message || 'PIN inválido.'),
  })

  if (isLoading) return <PageSpinner />
  if (lots.length === 0) return (
    <div className="py-16 text-center text-gray-400">
      <ParkingSquare size={36} className="mx-auto mb-2 text-gray-200" />
      <p className="text-sm">Você ainda não tem um estacionamento cadastrado.</p>
    </div>
  )

  const field = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] focus:border-brand focus:ring-1 focus:ring-brand outline-none'

  return (
    <div className="space-y-4">
      {lots.length > 1 && (
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">Estacionamento</label>
          <select value={lot} onChange={(e) => setLotId(e.target.value)} className={field}>
            {!lotId && <option value="">Selecione…</option>}
            {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {/* Entrada por código */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 text-gray-900 font-semibold text-[14px]">
          <LogIn size={16} className="text-brand" /> Registrar entrada
        </div>
        <p className="text-[12px] text-gray-500 -mt-1">O cliente informa o código de entrada (ou mostra o QR).</p>
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de entrada (ex.: ABC234)"
            className={`${field} font-mono tracking-widest uppercase flex-1`} maxLength={12} />
          <ScanQRButton onDetected={(v) => setCode(String(v).toUpperCase())} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Placa (opcional)" className={`${field} uppercase`} maxLength={12} />
          <input value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="Vaga (opcional)" className={field} maxLength={20} />
        </div>
        <button onClick={() => entrada.mutate()} disabled={!lot || code.trim().length < 4 || entrada.isPending}
          className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold text-[14px] rounded-xl py-3 active:scale-[0.99] disabled:opacity-50">
          {entrada.isPending ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Dar entrada
        </button>
      </div>

      {/* Retirada por PIN */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 text-gray-900 font-semibold text-[14px]">
          <KeyRound size={16} className="text-brand" /> Validar retirada
        </div>
        <p className="text-[12px] text-gray-500 -mt-1">Digite o PIN que o cliente apresenta no app. Ele tem validade curta.</p>
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="PIN de retirada"
          className={`${field} font-mono tracking-[0.3em] text-center text-lg`} maxLength={10} />
        <button onClick={() => retirada.mutate()} disabled={!lot || pin.trim().length < 4 || retirada.isPending}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-bold text-[14px] rounded-xl py-3 active:scale-[0.99] disabled:opacity-50">
          {retirada.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Liberar saída
        </button>
      </div>
    </div>
  )
}
