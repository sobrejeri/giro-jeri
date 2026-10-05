import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ParkingSquare, Plus, Pencil, Loader2, X, Check, ImagePlus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'

const money = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

// Reduz a imagem no cliente antes de enviar (mesmo padrão das outras telas).
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

const LOT_VAZIO = {
  name: '', owner_user_id: '', description: '', capacity: 10, commission_pct: 10,
  accept_deadline_min: 1440, payment_deadline_min: 15, pin_ttl_min: 5, refund_cutoff_min: 1440,
  lat: '', lng: '', is_active: true,
}

export default function Estacionamentos() {
  const qc = useQueryClient()
  const [aba, setAba] = useState('catalogo') // 'catalogo' | 'reservas' | 'repasses'
  const [edit, setEdit] = useState(null) // lot sendo editado, ou LOT_VAZIO para novo
  const { data, isLoading } = useQuery({ queryKey: ['admin-parking-lots'], queryFn: () => api.getParkingLots() })
  const lots = data?.data || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2"><ParkingSquare size={22} className="text-brand" /> Estacionamentos</h1>
        {aba === 'catalogo' && (
          <button onClick={() => setEdit({ ...LOT_VAZIO })}
            className="flex items-center gap-2 bg-brand text-white font-semibold rounded-xl px-4 py-2.5 text-sm active:scale-95">
            <Plus size={16} /> Novo
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {[['catalogo', 'Catálogo'], ['reservas', 'Reservas'], ['repasses', 'Repasses']].map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)}
            className={`px-3.5 py-2 rounded-full text-[13px] font-semibold border ${aba === id ? 'border-brand text-brand bg-brand/5' : 'border-gray-700 text-gray-500 bg-gray-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {aba === 'reservas' && <ReservasAdmin />}
      {aba === 'repasses' && <RepassesAdmin />}
      {aba !== 'catalogo' ? null : (
      <>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Carregando…</p>
      ) : lots.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <ParkingSquare size={36} className="mx-auto mb-2 text-gray-700" />
          <p className="text-sm">Nenhum estacionamento cadastrado ainda.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lots.map((l) => {
            const tarifas = (l.parking_tariffs || []).filter((t) => t.is_active !== false)
            return (
              <div key={l.id} className="bg-gray-800 rounded-2xl border border-gray-700 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-gray-100">{l.name}</p>
                    <p className="text-[12px] text-gray-400">Capacidade {l.capacity} · comissão {l.commission_pct}%</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!l.is_active && <span className="text-[10px] font-bold text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">Inativo</span>}
                    <button onClick={() => setEdit(l)} className="p-2 text-gray-400 hover:text-brand"><Pencil size={16} /></button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tarifas.length === 0 ? (
                    <span className="text-[11px] text-amber-400">Sem tarifa — defina ao editar</span>
                  ) : tarifas.map((t) => (
                    <span key={t.id} className="text-[11px] bg-gray-900/40 border border-gray-700 rounded-full px-2 py-0.5 text-gray-400 capitalize">
                      {t.vehicle_type}: {money(t.price_per_unit)}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      </>
      )}

      {edit && <LotModal lot={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); qc.invalidateQueries({ queryKey: ['admin-parking-lots'] }) }} />}
    </div>
  )
}

// ── Reservas de estacionamento (admin) ────────────────────────────────────────
const RES_STATUS = {
  awaiting_partner: 'Aguardando parceiro', accepted_awaiting_payment: 'Aguardando pagamento',
  confirmed: 'Confirmada', in_lot: 'No pátio', withdrawal_requested: 'Retirada solicitada',
  completed: 'Concluída', rejected: 'Recusada', cancelled: 'Cancelada',
  expired_no_answer: 'Expirada', expired_no_payment: 'Expirou s/ pgto',
}
function ReservasAdmin() {
  const [status, setStatus] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['admin-parking-res', status], queryFn: () => api.getParkingReservations(status) })
  const lista = data?.data || []
  const dt = (s) => { try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return s } }
  return (
    <div className="space-y-3">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-gray-700 rounded-lg px-3 h-9 text-sm outline-none focus:border-brand bg-gray-900 text-gray-100 placeholder-gray-500">
        <option value="">Todos os status</option>
        {Object.entries(RES_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {isLoading ? <p className="text-gray-400 text-sm">Carregando…</p> : lista.length === 0 ? (
        <p className="text-gray-400 text-sm py-10 text-center">Nenhuma reserva.</p>
      ) : (
        <div className="overflow-x-auto bg-gray-800 rounded-2xl border border-gray-700">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] text-gray-400 border-b border-gray-700">
              <th className="px-3 py-2">Código</th><th className="px-3 py-2">Estacionamento</th><th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Período</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Total</th>
            </tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} className="border-b border-gray-800">
                  <td className="px-3 py-2 font-mono text-[11px] text-brand">{r.code}</td>
                  <td className="px-3 py-2">{r.lot_name}</td>
                  <td className="px-3 py-2 text-gray-400">{r.user_name}</td>
                  <td className="px-3 py-2 text-[12px] text-gray-500">{dt(r.start_at)} → {dt(r.end_at)}</td>
                  <td className="px-3 py-2 text-[12px]">{RES_STATUS[r.status] || r.status}{r.refund_status === 'eligible' ? ' · reemb.' : ''}</td>
                  <td className="px-3 py-2 text-right font-semibold">{money(r.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Repasses por parceiro (admin) ─────────────────────────────────────────────
function RepassesAdmin() {
  const [periodo, setPeriodo] = useState('mes')
  const q = periodo === 'mes'
    ? `?from=${new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()}`
    : periodo === '30d' ? `?from=${new Date(Date.now() - 30 * 864e5).toISOString()}` : ''
  const { data, isLoading } = useQuery({ queryKey: ['admin-parking-payouts', periodo], queryFn: () => api.getParkingPayouts(q) })
  const parceiros = data?.parceiros || []
  const totalLiquido = parceiros.reduce((a, p) => a + Number(p.liquido || 0), 0)
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[['mes', 'Este mês'], ['30d', 'Últimos 30d'], ['tudo', 'Tudo']].map(([id, label]) => (
          <button key={id} onClick={() => setPeriodo(id)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${periodo === id ? 'border-brand text-brand bg-brand/5' : 'border-gray-700 text-gray-500 bg-gray-800'}`}>{label}</button>
        ))}
      </div>
      {isLoading ? <p className="text-gray-400 text-sm">Carregando…</p> : parceiros.length === 0 ? (
        <p className="text-gray-400 text-sm py-10 text-center">Sem repasses no período.</p>
      ) : (
        <div className="bg-gray-800 rounded-2xl border border-gray-700 divide-y divide-gray-800">
          {parceiros.map((p) => (
            <div key={p.owner_user_id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-semibold text-gray-100 text-sm">{p.nome}</p>
                <p className="text-[11px] text-gray-400">{p.qtd} reserva(s) · bruto {money(p.bruto)} · comissão {money(p.comissao)}</p>
              </div>
              <span className="font-extrabold text-emerald-400">{money(p.liquido)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900/40">
            <span className="font-semibold text-gray-300 text-sm">Total a repassar</span>
            <span className="font-extrabold text-gray-100">{money(totalLiquido)}</span>
          </div>
        </div>
      )}
      <p className="text-[11px] text-gray-400 text-center">Apuração informativa. Repasses processados conforme o combinado da plataforma.</p>
    </div>
  )
}

function LotModal({ lot, onClose, onSaved }) {
  const novo = !lot.id
  const [form, setForm] = useState({ ...LOT_VAZIO, photos: [], ...lot, photos: lot.photos || [] })
  const [erro, setErro] = useState('')
  const [buscaDono, setBuscaDono] = useState('')
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function onPickPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setErro('Use JPEG, PNG ou WebP.'); e.target.value = ''; return }
    setErro(''); setEnviandoFoto(true)
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      const { url } = await api.uploadSiteImage(dataUrl, 'estacionamento')
      setForm((f) => ({ ...f, photos: [...(f.photos || []), url].slice(0, 10) }))
    } catch (err) { setErro(err?.message || 'Falha ao enviar a imagem.') }
    finally { setEnviandoFoto(false); e.target.value = '' }
  }

  const { data: donos } = useQuery({
    queryKey: ['admin-users-op', buscaDono],
    queryFn: () => api.getUsers({ user_type: 'operator', search: buscaDono, limit: 20 }),
    enabled: novo || buscaDono.length > 0,
  })

  const salvar = useMutation({
    mutationFn: async () => {
      const num = (v) => (v === '' || v === null ? null : Number(v))
      const payload = {
        name: form.name.trim(), description: form.description?.trim() || null,
        capacity: Number(form.capacity), commission_pct: Number(form.commission_pct),
        accept_deadline_min: Number(form.accept_deadline_min), payment_deadline_min: Number(form.payment_deadline_min),
        pin_ttl_min: Number(form.pin_ttl_min), refund_cutoff_min: Number(form.refund_cutoff_min),
        lat: num(form.lat), lng: num(form.lng), is_active: !!form.is_active,
        photos: form.photos || [],
      }
      if (novo) { payload.owner_user_id = form.owner_user_id; return api.createParkingLot(payload) }
      return api.updateParkingLot(lot.id, payload)
    },
    onSuccess: onSaved,
    onError: (e) => setErro(e?.message || 'Não foi possível salvar.'),
  })

  const campo = 'w-full border border-gray-700 rounded-lg px-3 h-10 text-sm outline-none focus:border-brand bg-gray-900 text-gray-100 placeholder-gray-500'
  const label = 'block text-[12px] font-semibold text-gray-500 mb-1'

  function submit() {
    setErro('')
    if (!form.name.trim()) return setErro('Informe o nome.')
    if (novo && !form.owner_user_id) return setErro('Selecione o parceiro dono.')
    salvar.mutate()
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-gray-700 sticky top-0 bg-gray-800">
          <h2 className="font-bold text-gray-100">{novo ? 'Novo estacionamento' : 'Editar estacionamento'}</h2>
          <button onClick={onClose} className="p-2 text-gray-400"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className={label}>Nome</label>
            <input value={form.name} onChange={(e) => setF('name', e.target.value)} className={campo} />
          </div>

          {novo && (
            <div>
              <label className={label}>Parceiro dono</label>
              <input value={buscaDono} onChange={(e) => setBuscaDono(e.target.value)} placeholder="Buscar por nome, e-mail ou documento" className={`${campo} mb-1`} />
              <select value={form.owner_user_id} onChange={(e) => setF('owner_user_id', e.target.value)} className={campo}>
                <option value="">Selecione…</option>
                {(donos?.data || donos?.users || []).map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={label}>Descrição</label>
            <textarea value={form.description || ''} onChange={(e) => setF('description', e.target.value)} rows={2}
              className="w-full border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand bg-gray-900 text-gray-100 placeholder-gray-500 resize-none" />
          </div>

          <div>
            <label className={label}>Fotos</label>
            <div className="flex flex-wrap gap-2">
              {(form.photos || []).map((url, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-700">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><Trash2 size={12} /></button>
                </div>
              ))}
              {(form.photos || []).length < 10 && (
                <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center cursor-pointer text-gray-400 hover:border-brand hover:text-brand">
                  {enviandoFoto ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickPhoto} />
                </label>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Capacidade (vagas)</label><input type="number" min="0" value={form.capacity} onChange={(e) => setF('capacity', e.target.value)} className={campo} /></div>
            <div><label className={label}>Comissão (%)</label><input type="number" min="0" max="100" step="0.1" value={form.commission_pct} onChange={(e) => setF('commission_pct', e.target.value)} className={campo} /></div>
            <div><label className={label}>Prazo de aceite (min)</label><input type="number" min="1" value={form.accept_deadline_min} onChange={(e) => setF('accept_deadline_min', e.target.value)} className={campo} /></div>
            <div><label className={label}>Prazo de pagamento (min)</label><input type="number" min="1" value={form.payment_deadline_min} onChange={(e) => setF('payment_deadline_min', e.target.value)} className={campo} /></div>
            <div><label className={label}>Validade do PIN (min)</label><input type="number" min="1" value={form.pin_ttl_min} onChange={(e) => setF('pin_ttl_min', e.target.value)} className={campo} /></div>
            <div><label className={label}>Reembolso: antecedência (min)</label><input type="number" min="0" value={form.refund_cutoff_min} onChange={(e) => setF('refund_cutoff_min', e.target.value)} className={campo} /></div>
            <div><label className={label}>Latitude</label><input value={form.lat ?? ''} onChange={(e) => setF('lat', e.target.value)} className={campo} /></div>
            <div><label className={label}>Longitude</label><input value={form.lng ?? ''} onChange={(e) => setF('lng', e.target.value)} className={campo} /></div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={!!form.is_active} onChange={(e) => setF('is_active', e.target.checked)} /> Ativo (aparece para os clientes)
          </label>

          {!novo && <TarifasEditor lot={lot} />}

          {erro && <p className="text-[12px] text-red-500">{erro}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-700 sticky bottom-0 bg-gray-800 flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-700 text-gray-300 font-semibold rounded-xl py-2.5 text-sm">Cancelar</button>
          <button onClick={submit} disabled={salvar.isPending}
            className="flex-1 flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-60">
            {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// Tarifas por veículo — só na edição (precisa do lot.id).
function TarifasEditor({ lot }) {
  const qc = useQueryClient()
  const [nova, setNova] = useState({ vehicle_type: '', price_per_unit: '', hours_per_unit: 24, min_units: 1 })
  const { data } = useQuery({ queryKey: ['admin-parking-lots'] })
  const atual = (data?.data || []).find((l) => l.id === lot.id)
  const tarifas = (atual?.parking_tariffs || []).filter((t) => t.is_active !== false)

  const add = useMutation({
    mutationFn: () => api.addParkingTariff(lot.id, {
      vehicle_type: nova.vehicle_type.trim(), price_per_unit: Number(nova.price_per_unit),
      hours_per_unit: Number(nova.hours_per_unit), min_units: Number(nova.min_units),
    }),
    onSuccess: () => { setNova({ vehicle_type: '', price_per_unit: '', hours_per_unit: 24, min_units: 1 }); qc.invalidateQueries({ queryKey: ['admin-parking-lots'] }) },
  })
  const remover = useMutation({
    mutationFn: (id) => api.updateParkingTariff(id, { is_active: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-parking-lots'] }),
  })

  return (
    <div className="border-t border-gray-700 pt-3">
      <p className="text-[12px] font-semibold text-gray-500 mb-2">Tarifas por veículo</p>
      <div className="space-y-1.5 mb-2">
        {tarifas.length === 0 && <p className="text-[12px] text-amber-400">Nenhuma tarifa — adicione ao menos uma.</p>}
        {tarifas.map((t) => (
          <div key={t.id} className="flex items-center justify-between bg-gray-900/40 rounded-lg px-3 py-2 text-sm">
            <span className="capitalize text-gray-300">{t.vehicle_type} · {money(t.price_per_unit)} / {t.hours_per_unit}h</span>
            <button onClick={() => remover.mutate(t.id)} className="text-red-400 hover:text-red-600"><X size={15} /></button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={nova.vehicle_type} onChange={(e) => setNova((n) => ({ ...n, vehicle_type: e.target.value }))} placeholder="Veículo (ex.: carro)" className="border border-gray-700 rounded-lg px-3 h-9 text-sm outline-none focus:border-brand bg-gray-900 text-gray-100 placeholder-gray-500" />
        <input value={nova.price_per_unit} onChange={(e) => setNova((n) => ({ ...n, price_per_unit: e.target.value }))} inputMode="decimal" placeholder="Preço/diária" className="border border-gray-700 rounded-lg px-3 h-9 text-sm outline-none focus:border-brand bg-gray-900 text-gray-100 placeholder-gray-500" />
      </div>
      <button onClick={() => add.mutate()} disabled={!nova.vehicle_type.trim() || !nova.price_per_unit || add.isPending}
        className="mt-2 w-full flex items-center justify-center gap-2 border border-brand text-brand font-semibold rounded-lg py-2 text-sm disabled:opacity-50">
        {add.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar tarifa
      </button>
    </div>
  )
}
