import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ParkingSquare, Clock, Car, Check, X, Loader2, LogIn, KeyRound, Wallet, Settings, ImagePlus, Trash2, Plus, QrCode, MapPin } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageSpinner } from '../components/ui/Spinner'

// Caminho de cada seção no menu lateral (operador de estacionamento).
const SECTION_PATH = {
  inicio: '/estacionamento', fila: '/estacionamento/solicitacoes', reservas: '/estacionamento/reservas',
  patio: '/estacionamento/patio', financeiro: '/estacionamento/financeiro', meulocal: '/estacionamento/meu-local',
}

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
  awaiting_partner:          { label: 'Nova',          cls: 'bg-amber-100 text-amber-700' },
  accepted_awaiting_payment: { label: 'Aguardando pagamento', cls: 'bg-amber-100 text-amber-700' },
  confirmed:                 { label: 'Confirmada',    cls: 'bg-emerald-100 text-emerald-700' },
  in_lot:                    { label: 'No pátio',      cls: 'bg-blue-100 text-blue-700' },
  withdrawal_requested:      { label: 'Retirada solicitada', cls: 'bg-blue-100 text-blue-700' },
  completed:                 { label: 'Concluída',     cls: 'bg-gray-100 text-gray-600' },
  rejected:                  { label: 'Recusada',      cls: 'bg-red-100 text-red-600' },
  cancelled:                 { label: 'Cancelada',     cls: 'bg-red-100 text-red-600' },
  expired_no_answer:         { label: 'Expirou sem resposta', cls: 'bg-gray-100 text-gray-500' },
  expired_no_payment:        { label: 'Expirou sem pagamento', cls: 'bg-gray-100 text-gray-500' },
}

// ── Painel do estacionamento (parceiro) — núcleo operacional ──────────────────
// Fila de solicitações (aceitar/recusar) e reservas em andamento. Entrada por
// QR e retirada com PIN vêm nas próximas fases.
export default function Estacionamento({ section }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
  // Operador de estacionamento navega pelo MENU lateral (uma seção por rota);
  // admin/tours (entrada única) continua com abas dentro da página.
  const menuMode = !!section || (user?.user_type !== 'admin' && user?.operator_segment === 'parking')
  const [aba, setAba] = useState('inicio')
  const active = section || (menuMode ? (section || 'inicio') : aba)
  const irPara = (sec) => { if (menuMode) navigate(SECTION_PATH[sec] || '/estacionamento'); else setAba(sec) }
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
      {/* No modo menu (operador de vagas), o cabeçalho superior já mostra a seção
          — não repetimos o título aqui. No modo abas, mantém o título. */}
      {!menuMode && (
        <div className="flex items-center gap-2">
          <ParkingSquare size={20} className="text-brand" />
          <h1 className="text-lg font-bold text-gray-900">Estacionamento</h1>
        </div>
      )}

      {/* Abas (só no modo página única — admin/tours). No menu lateral some. */}
      {!menuMode && (
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 [&>button]:shrink-0">
          {[['inicio', 'Início'], ['fila', `Solicitações`], ['reservas', 'Reservas'], ['patio', 'Pátio'], ['financeiro', 'Financeiro'], ['meulocal', 'Meu local']].map(([id, label]) => (
            <button key={id} onClick={() => setAba(id)}
              className={`px-3.5 py-2 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 ${active === id ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
              {id === 'meulocal' && <Settings size={13} />}{label}
              {id === 'fila' && <span className="text-[10px] px-1.5 rounded-full bg-gray-100">{fila.length}</span>}
              {id === 'reservas' && <span className="text-[10px] px-1.5 rounded-full bg-gray-100">{ativas.length}</span>}
            </button>
          ))}
        </div>
      )}

      {active === 'inicio' ? (
        <InicioDashboard onGo={irPara} filaCount={fila.length} />
      ) : active === 'patio' ? (
        <PatioView notify={notify} onDone={() => qc.invalidateQueries({ queryKey: ['parking-partner'] })} />
      ) : active === 'financeiro' ? (
        <FinanceiroParking />
      ) : active === 'meulocal' ? (
        <MeuEstacionamento notify={notify} />
      ) : active === 'fila' ? (
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

      <RepasseLista itens={data?.itens || []} />

      <p className="text-[11px] text-gray-400 text-center">Apuração informativa. Os repasses são processados conforme o combinado da plataforma.</p>
    </div>
  )
}

// Lista de repasses por reserva (A liberar / Em curso) + detalhe com linha do tempo.
function RepasseLista({ itens }) {
  const [sub, setSub] = useState('a_liberar')
  const [det, setDet] = useState(null)
  const grupos = {
    a_liberar: itens.filter((i) => i.repasse === 'a_liberar'),
    em_curso: itens.filter((i) => i.repasse === 'em_curso'),
  }
  const lista = grupos[sub]
  const TABS = [['a_liberar', 'A liberar'], ['em_curso', 'Em curso']]
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${sub === id ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
            {label} <span className="text-[10px] px-1.5 rounded-full bg-gray-100">{grupos[id].length}</span>
          </button>
        ))}
      </div>
      {lista.length === 0 ? <p className="text-[12px] text-gray-400 py-6 text-center">Nada aqui.</p> : lista.map((i) => (
        <button key={i.id} onClick={() => setDet(i)} className="w-full text-left bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between active:scale-[0.99]">
          <div><p className="font-mono text-[11px] font-bold text-brand">{i.code}</p><p className="text-[12px] text-gray-500">{i.user_name || 'Cliente'}</p></div>
          <div className="text-right"><p className="text-[14px] font-extrabold text-emerald-600">{money(i.liquido)}</p><p className="text-[10px] text-gray-400">{i.repasse === 'a_liberar' ? 'a liberar' : 'em curso'}</p></div>
        </button>
      ))}
      {det && <RepasseDetalhe item={det} onClose={() => setDet(null)} />}
    </div>
  )
}

function RepasseDetalhe({ item: i, onClose }) {
  const liberavel = i.repasse === 'a_liberar'
  const passos = [
    { label: 'Pagamento recebido', done: true },
    { label: 'Estadia realizada', done: liberavel },
    { label: 'Liberação pendente', done: false, atual: liberavel },
    { label: 'Repasse a efetuar', done: false },
  ]
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Repasse · {i.code}</h2>
          <button onClick={onClose} className="p-2 text-gray-400"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-2xl bg-gray-50 p-3 text-[13px] space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Valor da reserva</span><span className="font-semibold">{money(i.bruto)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Comissão</span><span>− {money(i.comissao)}</span></div>
            <div className="flex justify-between pt-1 border-t border-gray-200"><span className="font-semibold text-gray-700">Líquido a receber</span><span className="font-extrabold text-emerald-600">{money(i.liquido)}</span></div>
          </div>
          <div className="space-y-2">
            {passos.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2 text-[13px]">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${p.done ? 'bg-emerald-500 text-white' : p.atual ? 'bg-brand text-white' : 'bg-gray-200 text-gray-400'}`}>{p.done ? '✓' : idx + 1}</span>
                <span className={p.done ? 'text-gray-800 font-medium' : p.atual ? 'text-brand font-medium' : 'text-gray-400'}>{p.label}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">O repasse é liberado após a saída do veículo e a validação da estadia pela plataforma.</p>
        </div>
      </div>
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
  const oh = lot.opening_hours || {}
  const [form, setForm] = useState({
    name: lot.name || '', description: lot.description || '', capacity: lot.capacity ?? 0,
    photos: lot.photos || [], is_active: lot.is_active !== false,
    address: lot.address || '', lat: lot.lat ?? '', lng: lot.lng ?? '',
    is_24h: oh.is_24h !== false, abre: oh.open || '08:00', fecha: oh.close || '18:00',
    coberto: !!oh.coberto,
    // Taxa de atraso (excedente). Valor exibido em reais; salvo em centavos.
    taxa_valor: lot.overstay_fee_cents ? (lot.overstay_fee_cents / 100).toString() : '',
    taxa_unidade: lot.overstay_fee_unit || 'hour',
    taxa_tolerancia: lot.overstay_grace_min ?? 0,
  })
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  function usarLocalizacao() {
    if (!navigator.geolocation) { notify?.('err', 'Geolocalização indisponível neste aparelho.'); return }
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })); setGeoLoading(false); notify?.('ok', 'Localização capturada.') },
      () => { setGeoLoading(false); notify?.('err', 'Não foi possível obter a localização.') },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const salvar = useMutation({
    mutationFn: () => api.parkingUpdateMyLot(lot.id, {
      name: form.name.trim(), description: form.description.trim() || null,
      capacity: Number(form.capacity), photos: form.photos, is_active: !!form.is_active,
      address: form.address.trim() || null,
      lat: form.lat === '' ? null : Number(form.lat), lng: form.lng === '' ? null : Number(form.lng),
      opening_hours: {
        ...(lot.opening_hours || {}),
        is_24h: !!form.is_24h, open: form.abre, close: form.fecha, coberto: !!form.coberto,
      },
      overstay_fee_cents: Math.max(0, Math.round(Number(form.taxa_valor || 0) * 100)),
      overstay_fee_unit: form.taxa_unidade === 'day' ? 'day' : 'hour',
      overstay_grace_min: Math.max(0, Number(form.taxa_tolerancia || 0)),
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
        <label className={label}>Endereço</label>
        <input value={form.address} onChange={(e) => setF('address', e.target.value)} className={campo}
          placeholder="Rua, nº, bairro — Jijoca de Jericoacoara" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[12px] font-semibold text-gray-500">Localização no mapa</label>
          <button type="button" onClick={usarLocalizacao} disabled={geoLoading}
            className="text-[11px] font-semibold text-brand flex items-center gap-1">
            {geoLoading ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />} Usar localização atual
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.lat} onChange={(e) => setF('lat', e.target.value)} inputMode="decimal" placeholder="Latitude" className={campo} />
          <input value={form.lng} onChange={(e) => setF('lng', e.target.value)} inputMode="decimal" placeholder="Longitude" className={campo} />
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Com as coordenadas, o cliente abre a rota no Google Maps/Waze.</p>
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

      {/* Funcionamento */}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={!!form.is_24h} onChange={(e) => setF('is_24h', e.target.checked)} /> Funciona 24 horas
        </label>
        {!form.is_24h && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Abre</label><input type="time" value={form.abre} onChange={(e) => setF('abre', e.target.value)} className={campo} /></div>
            <div><label className={label}>Fecha</label><input type="time" value={form.fecha} onChange={(e) => setF('fecha', e.target.value)} className={campo} /></div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={!!form.coberto} onChange={(e) => setF('coberto', e.target.checked)} /> Vagas cobertas
        </label>
      </div>

      {/* Taxa por atraso (excedente) */}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <label className={label}>Taxa por atraso (excedente)</label>
        <p className="text-[11px] text-gray-400 -mt-1">Cobrada quando o cliente ultrapassa o período reservado. O cliente vê o valor acumulando na reserva dele.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Valor (R$)</label>
            <input type="number" min="0" step="0.01" value={form.taxa_valor} onChange={(e) => setF('taxa_valor', e.target.value)} className={campo} placeholder="0,00" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Cobrar por</label>
            <select value={form.taxa_unidade} onChange={(e) => setF('taxa_unidade', e.target.value)} className={campo}>
              <option value="hour">Hora</option>
              <option value="day">Dia</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Tolerância (min)</label>
          <input type="number" min="0" value={form.taxa_tolerancia} onChange={(e) => setF('taxa_tolerancia', e.target.value)} className={campo} placeholder="0" />
          <p className="text-[11px] text-gray-400 mt-1">Minutos de atraso sem cobrança (ex.: 15). Deixe 0 para cobrar desde o 1º minuto.</p>
        </div>
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
  const qc = useQueryClient()
  const [sub, setSub] = useState('novas')
  const [analise, setAnalise] = useState(null)
  const { data: chData } = useQuery({ queryKey: ['parking-changes'], queryFn: () => api.parkingChangeRequests(), refetchInterval: 15000 })
  const changes = (chData?.data || []).filter((c) => c.status === 'pending')
  const grupos = {
    novas: reservas.filter((r) => r.status === 'awaiting_partner'),
    aceitas: reservas.filter((r) => ['accepted_awaiting_payment', 'confirmed', 'in_lot'].includes(r.status)),
    recusadas: reservas.filter((r) => ['rejected', 'expired_no_answer', 'expired_no_payment', 'cancelled'].includes(r.status)),
  }
  const lista = grupos[sub] || []
  const TABS = [['novas', 'Novas'], ['aceitas', 'Aceitas'], ['recusadas', 'Recusadas'], ['alteracoes', 'Alterações']]

  const aprovarCh = useMutation({ mutationFn: (id) => api.parkingApproveChange(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['parking-changes'] }) })
  const recusarCh = useMutation({ mutationFn: (id) => api.parkingRejectChange(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['parking-changes'] }) })

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 [&>button]:shrink-0">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${sub === id ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-500 bg-white'}`}>
            {label} <span className="text-[10px] px-1.5 rounded-full bg-gray-100">{id === 'alteracoes' ? changes.length : grupos[id].length}</span>
          </button>
        ))}
      </div>

      {sub === 'alteracoes' ? (
        changes.length === 0 ? <p className="text-[13px] text-gray-400 py-10 text-center">Nenhum pedido de alteração.</p> : (
          <div className="space-y-2">
            {changes.map((c) => {
              const rr = c.parking_reservations || {}
              const proc = aprovarCh.isPending || recusarCh.isPending
              return (
                <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center justify-between"><span className="font-mono text-[11px] font-bold text-brand">{rr.code}</span><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Alteração</span></div>
                  <p className="text-[13px] text-gray-700 mt-1">Nova saída: <strong>{dtBR(c.new_end_at)}</strong> · {c.new_units} diária(s)</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <span className="text-[14px] font-extrabold text-gray-900">+ {money(c.delta)}</span>
                    <div className="flex gap-2">
                      <button onClick={() => recusarCh.mutate(c.id)} disabled={proc} className="text-[12px] font-semibold text-gray-500 border border-gray-200 rounded-lg px-3 py-2">Recusar</button>
                      <button onClick={() => aprovarCh.mutate(c.id)} disabled={proc} className="text-[12px] font-bold text-white bg-brand rounded-lg px-4 py-2">{proc ? <Loader2 size={13} className="animate-spin" /> : 'Aprovar'}</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : null}
      {sub !== 'alteracoes' && (<>

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
      </>)}
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
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 [&>button]:shrink-0">
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tint}`}><Icon size={19} /></div>
      <p className="text-[22px] font-extrabold text-gray-900 leading-none">{big}</p>
      <p className="text-[12px] text-gray-400 leading-tight">{label}</p>
    </div>
  )
  return (
    <div className="space-y-4">
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

  const [saidaStay, setSaidaStay] = useState(null) // estadia aguardando PIN de retirada
  const sair = useMutation({
    mutationFn: ({ id, pin }) => api.parkingStayExit(id, pin),
    onSuccess: () => { notify?.('ok', 'Saída registrada.'); setSaidaStay(null); refresh() },
    onError: (e) => notify?.('err', e?.message || 'Erro ao registrar saída.'),
  })
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
                    <button onClick={() => setSaidaStay(v)} disabled={sair.isPending} className="flex-1 text-[12px] font-semibold text-white bg-gray-900 rounded-lg py-1.5">Registrar saída</button>
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
      {saidaStay && <SaidaPinModal stay={saidaStay} pending={sair.isPending} onClose={() => setSaidaStay(null)} onConfirm={(pin) => sair.mutate({ id: saidaStay.id, pin })} />}
    </div>
  )
}

// Pede o PIN de retirada (repassado ao cliente) para liberar a saída do walk-in.
function SaidaPinModal({ stay, pending, onClose, onConfirm }) {
  const [pin, setPin] = useState('')
  return (
    <div className="fixed inset-0 z-[95] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Retirada do veículo</h2>
          <button onClick={onClose} className="p-2 text-gray-400"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[13px] text-gray-600">Peça ao cliente o <b>PIN de retirada</b> do veículo <span className="font-mono font-bold">{stay.plate || '—'}</span>.</p>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" placeholder="PIN (6 dígitos)" autoFocus
            className="w-full border border-gray-200 rounded-xl px-3 h-12 text-center font-mono text-[22px] tracking-[0.3em] outline-none focus:border-brand"
          />
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-sm">Cancelar</button>
          <button onClick={() => onConfirm(pin)} disabled={pending || pin.length < 6}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-50">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Confirmar saída
          </button>
        </div>
      </div>
    </div>
  )
}

// Modal de entrada presencial (walk-in) — cobrança pela plataforma (liquidação
// presencial: dinheiro/pix no balcão, entra no repasse).
function WalkinModal({ notify, onClose, onDone }) {
  const { data: lotsData } = useQuery({ queryKey: ['parking-partner-lots'], queryFn: () => api.parkingPartnerLots() })
  const lots = lotsData?.data || []

  // Defaults: entrada = agora (meia hora mais próxima), saída = +1 dia.
  const agora = new Date()
  const d2 = (n) => String(n).padStart(2, '0')
  const dataStr = (dt) => `${dt.getFullYear()}-${d2(dt.getMonth() + 1)}-${d2(dt.getDate())}`
  const horaStr = (dt) => `${d2(dt.getHours())}:${dt.getMinutes() < 30 ? '00' : '30'}`
  const amanha = new Date(agora.getTime() + 24 * 3600_000)

  const [f, setF] = useState({
    lot_id: '', client_name: '', client_phone: '',
    entradaD: dataStr(agora), entradaH: horaStr(agora),
    saidaD: dataStr(amanha), saidaH: horaStr(amanha),
    amount: '', payment_status: 'paid',
  })
  // Lista de veículos (1 vaga cada): tipo + placa + vaga.
  const [veiculos, setVeiculos] = useState([{ vehicle_type: 'carro', plate: '', spot: '' }])
  const lot = f.lot_id || (lots.length === 1 ? lots[0].id : '')
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }))
  const setV = (i, k, v) => setVeiculos((arr) => arr.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const addV = () => setVeiculos((arr) => (arr.length >= 20 ? arr : [...arr, { vehicle_type: 'carro', plate: '', spot: '' }]))
  const delV = (i) => setVeiculos((arr) => (arr.length <= 1 ? arr : arr.filter((_, j) => j !== i)))

  const horas = []
  for (let m = 0; m < 24 * 60; m += 30) horas.push(`${d2(Math.floor(m / 60))}:${d2(m % 60)}`)

  const isoFuso = (d, t) => (d && t ? `${d}T${t}:00-03:00` : null)
  const startAt = isoFuso(f.entradaD, f.entradaH)
  const endAt = isoFuso(f.saidaD, f.saidaH)
  const periodoOk = startAt && endAt && Date.parse(endAt) > Date.parse(startAt)
  const placasOk = veiculos.every((v) => (v.plate || '').trim().length >= 6)

  const [pins, setPins] = useState(null) // [{ plate, pin }] — mostrados ao final

  const salvar = useMutation({
    mutationFn: async () => {
      // Um veículo = uma entrada (1 vaga), no mesmo período. Valor é por veículo.
      const res = []
      for (const v of veiculos) {
        const r = await api.parkingWalkin({
          lot_id: lot, client_name: f.client_name.trim(), client_phone: f.client_phone.trim() || null,
          vehicle_type: (v.vehicle_type || 'carro').trim(), plate: v.plate.trim().toUpperCase() || null,
          spot: v.spot.trim() || null,
          start_at: startAt, end_at: endAt, amount: Number(f.amount), payment_status: f.payment_status,
        })
        res.push({ plate: v.plate.trim().toUpperCase() || '—', pin: r?.withdrawal_pin || null })
      }
      return res
    },
    onSuccess: (res) => {
      notify?.('ok', veiculos.length > 1 ? `${veiculos.length} entradas registradas.` : 'Entrada presencial registrada.')
      setPins(res)
    },
    onError: (e) => notify?.('err', e?.message || 'Não foi possível registrar.'),
  })

  const total = (Number(f.amount || 0) * veiculos.length)
  const campo = 'w-full border border-gray-200 rounded-xl px-3 h-10 text-sm outline-none focus:border-brand'
  const label = 'block text-[11px] font-semibold text-gray-500 mb-1'
  // Tela de PIN(s) gerado(s) — mostrada após registrar, para repassar ao cliente.
  if (pins) {
    return (
      <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => onDone?.()}>
        <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 h-14 border-b border-gray-100 sticky top-0 bg-white z-10">
            <h2 className="font-bold text-gray-900">PIN de retirada</h2>
            <button onClick={() => onDone?.()} className="p-2 text-gray-400"><X size={20} /></button>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <KeyRound size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[12px] text-amber-800">Repasse o PIN ao cliente. Ele vai precisar informá-lo na <b>retirada do veículo</b>. Anote agora — por segurança, não é possível vê-lo de novo.</p>
            </div>
            {pins.map((p, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <span className="font-mono font-bold text-gray-700">{p.plate}</span>
                {p.pin ? (
                  <span className="font-mono text-[26px] font-black tracking-[0.3em] text-gray-900">{p.pin}</span>
                ) : (
                  <span className="text-[12px] text-gray-400">sem PIN (aplique a migration 119)</span>
                )}
              </div>
            ))}
          </div>
          <div className="px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button onClick={() => onDone?.()} className="w-full bg-brand text-white font-bold rounded-xl py-2.5 text-sm">Concluir</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-gray-100 sticky top-0 bg-white z-10">
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
          <input value={f.client_phone} onChange={(e) => set('client_phone', e.target.value)} placeholder="Telefone (opcional)" className={campo} />

          {/* Período: entrada e saída (data + hora) */}
          <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Entrada</label>
              <input type="date" value={f.entradaD} onChange={(e) => set('entradaD', e.target.value)} className={campo} />
            </div>
            <div>
              <label className={label}>Horário</label>
              <select value={f.entradaH} onChange={(e) => set('entradaH', e.target.value)} className={campo}>
                {horas.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Saída</label>
              <input type="date" value={f.saidaD} onChange={(e) => set('saidaD', e.target.value)} className={campo} />
            </div>
            <div>
              <label className={label}>Horário</label>
              <select value={f.saidaH} onChange={(e) => set('saidaH', e.target.value)} className={campo}>
                {horas.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
          {!periodoOk && <p className="text-[11px] text-red-500">A saída deve ser depois da entrada.</p>}

          {/* Veículos: um por linha, cada um com placa */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-semibold text-gray-600">Veículos ({veiculos.length})</label>
              <button type="button" onClick={addV} className="text-[12px] font-semibold text-brand flex items-center gap-1"><Plus size={13} /> Adicionar</button>
            </div>
            {veiculos.map((v, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                <input value={v.plate} onChange={(e) => setV(i, 'plate', e.target.value.toUpperCase())} placeholder={`Placa ${i + 1}`} className={`${campo} uppercase`} />
                <div className="grid grid-cols-2 gap-1">
                  <input value={v.vehicle_type} onChange={(e) => setV(i, 'vehicle_type', e.target.value)} placeholder="Tipo" className={campo} />
                  <input value={v.spot} onChange={(e) => setV(i, 'spot', e.target.value)} placeholder="Vaga" className={campo} />
                </div>
                <button type="button" onClick={() => delV(i)} disabled={veiculos.length <= 1}
                  className="w-8 h-8 rounded-lg border border-gray-200 text-gray-400 flex items-center justify-center disabled:opacity-30"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          {/* Valor e pagamento */}
          <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Valor por veículo (R$)</label>
              <input value={f.amount} onChange={(e) => set('amount', e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} />
            </div>
            <div>
              <label className={label}>Pagamento</label>
              <select value={f.payment_status} onChange={(e) => set('payment_status', e.target.value)} className={campo}>
                <option value="paid">Pago (balcão)</option>
                <option value="pending">Pendente</option>
              </select>
            </div>
          </div>
          {veiculos.length > 1 && Number(f.amount) > 0 && (
            <p className="text-[12px] text-gray-500">Total: <span className="font-bold text-gray-800">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> ({veiculos.length} × R$ {Number(f.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</p>
          )}

          {/* Espaço extra no fim para não colar no rodapé/indicador da tela */}
          <div className="h-6" />
        </div>
        <div className="px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white flex gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-sm">Cancelar</button>
          <button onClick={() => salvar.mutate()} disabled={salvar.isPending || !lot || !f.client_name.trim() || !f.amount || !periodoOk || !placasOk}
            className="flex-1 flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-50">
            {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

// Botão de leitura de QR — funciona em qualquer aparelho: usa BarcodeDetector
// nativo quando há (Android/Chrome) e cai no jsQR (JS puro) no iOS/Safari.
function ScanQRButton({ onDetected }) {
  const [aberto, setAberto] = useState(false)
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
  const canvasRef = useRef(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let stream, raf, parado = false, detector, jsQR
    const emitir = (v) => { if (!parado && v) { parado = true; onDetected(String(v)) } }
    async function start() {
      try {
        if ('BarcodeDetector' in window) { try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }) } catch { detector = null } }
        if (!detector) { jsQR = (await import('jsqr')).default }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (parado) { stream.getTracks().forEach((t) => t.stop()); return }
        const v = videoRef.current
        if (v) { v.srcObject = stream; v.setAttribute('playsinline', 'true'); await v.play() }
        const tick = async () => {
          if (parado || !videoRef.current) return
          try {
            if (detector) {
              const codes = await detector.detect(videoRef.current)
              if (codes && codes[0]?.rawValue) return emitir(codes[0].rawValue)
            } else if (jsQR && videoRef.current.videoWidth) {
              const c = canvasRef.current, vid = videoRef.current
              c.width = vid.videoWidth; c.height = vid.videoHeight
              const ctx = c.getContext('2d', { willReadFrequently: true })
              ctx.drawImage(vid, 0, 0, c.width, c.height)
              const img = ctx.getImageData(0, 0, c.width, c.height)
              const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
              if (r?.data) return emitir(r.data)
            }
          } catch { /* frame sem leitura */ }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch { setErro('Não foi possível abrir a câmera. Use o código manualmente.') }
    }
    start()
    return () => { parado = true; if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()) }
  }, [onDetected])
  return (
    <div className="fixed inset-0 z-[95] bg-black/80 flex flex-col items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-4 text-center" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-gray-900 mb-2">Escanear QR da reserva</p>
        {erro ? <p className="text-[13px] text-red-500 py-8">{erro}</p> : (
          <div className="relative">
            <video ref={videoRef} className="w-full rounded-xl bg-black aspect-square object-cover" muted playsInline />
            <div className="absolute inset-6 border-2 border-white/70 rounded-xl pointer-events-none" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <p className="text-[12px] text-gray-400 mt-2">Aponte para o QR do cliente.</p>
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
