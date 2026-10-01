import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ParkingSquare, Plus, Pencil, Loader2, X, Check } from 'lucide-react'
import { api } from '../lib/api'

const money = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const LOT_VAZIO = {
  name: '', owner_user_id: '', description: '', capacity: 10, commission_pct: 10,
  accept_deadline_min: 1440, payment_deadline_min: 15, pin_ttl_min: 5, refund_cutoff_min: 1440,
  lat: '', lng: '', is_active: true,
}

export default function Estacionamentos() {
  const qc = useQueryClient()
  const [edit, setEdit] = useState(null) // lot sendo editado, ou LOT_VAZIO para novo
  const { data, isLoading } = useQuery({ queryKey: ['admin-parking-lots'], queryFn: () => api.getParkingLots() })
  const lots = data?.data || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><ParkingSquare size={22} className="text-brand" /> Estacionamentos</h1>
        <button onClick={() => setEdit({ ...LOT_VAZIO })}
          className="flex items-center gap-2 bg-brand text-white font-semibold rounded-xl px-4 py-2.5 text-sm active:scale-95">
          <Plus size={16} /> Novo
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Carregando…</p>
      ) : lots.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <ParkingSquare size={36} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm">Nenhum estacionamento cadastrado ainda.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lots.map((l) => {
            const tarifas = (l.parking_tariffs || []).filter((t) => t.is_active !== false)
            return (
              <div key={l.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-gray-900">{l.name}</p>
                    <p className="text-[12px] text-gray-400">Capacidade {l.capacity} · comissão {l.commission_pct}%</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!l.is_active && <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Inativo</span>}
                    <button onClick={() => setEdit(l)} className="p-2 text-gray-400 hover:text-brand"><Pencil size={16} /></button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tarifas.length === 0 ? (
                    <span className="text-[11px] text-amber-600">Sem tarifa — defina ao editar</span>
                  ) : tarifas.map((t) => (
                    <span key={t.id} className="text-[11px] bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5 text-gray-600 capitalize">
                      {t.vehicle_type}: {money(t.price_per_unit)}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {edit && <LotModal lot={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); qc.invalidateQueries({ queryKey: ['admin-parking-lots'] }) }} />}
    </div>
  )
}

function LotModal({ lot, onClose, onSaved }) {
  const novo = !lot.id
  const [form, setForm] = useState({ ...LOT_VAZIO, ...lot })
  const [erro, setErro] = useState('')
  const [buscaDono, setBuscaDono] = useState('')
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))

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
      }
      if (novo) { payload.owner_user_id = form.owner_user_id; return api.createParkingLot(payload) }
      return api.updateParkingLot(lot.id, payload)
    },
    onSuccess: onSaved,
    onError: (e) => setErro(e?.message || 'Não foi possível salvar.'),
  })

  const campo = 'w-full border border-gray-200 rounded-lg px-3 h-10 text-sm outline-none focus:border-brand'
  const label = 'block text-[12px] font-semibold text-gray-500 mb-1'

  function submit() {
    setErro('')
    if (!form.name.trim()) return setErro('Informe o nome.')
    if (novo && !form.owner_user_id) return setErro('Selecione o parceiro dono.')
    salvar.mutate()
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">{novo ? 'Novo estacionamento' : 'Editar estacionamento'}</h2>
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand resize-none" />
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

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={!!form.is_active} onChange={(e) => setF('is_active', e.target.checked)} /> Ativo (aparece para os clientes)
          </label>

          {!novo && <TarifasEditor lot={lot} />}

          {erro && <p className="text-[12px] text-red-500">{erro}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-sm">Cancelar</button>
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
    <div className="border-t border-gray-100 pt-3">
      <p className="text-[12px] font-semibold text-gray-500 mb-2">Tarifas por veículo</p>
      <div className="space-y-1.5 mb-2">
        {tarifas.length === 0 && <p className="text-[12px] text-amber-600">Nenhuma tarifa — adicione ao menos uma.</p>}
        {tarifas.map((t) => (
          <div key={t.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
            <span className="capitalize text-gray-700">{t.vehicle_type} · {money(t.price_per_unit)} / {t.hours_per_unit}h</span>
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
