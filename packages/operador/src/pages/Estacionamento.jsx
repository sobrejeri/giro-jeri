import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ParkingSquare, Clock, Car, Check, X, Loader2, LogIn, KeyRound, Wallet, Settings, ImagePlus, Trash2, Plus } from 'lucide-react'
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
  const [aba, setAba] = useState('fila')     // 'fila' | 'reservas' | 'patio'
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

      {aba === 'patio' ? (
        <PatioBalcao notify={notify} onDone={() => qc.invalidateQueries({ queryKey: ['parking-partner'] })} />
      ) : aba === 'financeiro' ? (
        <FinanceiroParking />
      ) : aba === 'meulocal' ? (
        <MeuEstacionamento notify={notify} />
      ) : lista.length === 0 ? (
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
        <p className="text-[12px] text-gray-500 -mt-1">O cliente informa o código de entrada da reserva.</p>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de entrada (ex.: ABC234)"
          className={`${field} font-mono tracking-widest uppercase`} maxLength={12} />
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
