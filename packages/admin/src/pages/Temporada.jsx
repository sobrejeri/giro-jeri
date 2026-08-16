import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Sun, CalendarDays } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

// Converte mês (1-12) + ano corrente para uma data ISO no formato YYYY-MM-DD
function monthToDate(month, isEnd, startMonth = null) {
  const year = new Date().getFullYear()
  if (isEnd) {
    // Temporada que VIRA O ANO (ex.: Julho → Janeiro): o fim cai no ano
    // SEGUINTE. O comentário antigo dizia isso, mas o código usava sempre o ano
    // corrente — gerava end_date (31/01) menor que start_date (01/07), o banco
    // recusava pelo CHECK high_season_dates_check e era IMPOSSÍVEL salvar a
    // temporada principal da plataforma ("Julho a Janeiro").
    const endYear = (startMonth && Number(month) < Number(startMonth)) ? year + 1 : year
    const ultimoDia = new Date(endYear, Number(month), 0).getDate()
    // Montado à mão de propósito: toISOString() converte para UTC e, no fuso do
    // Brasil, devolvia o dia ANTERIOR (31/01 virava 30/01).
    return `${endYear}-${String(month).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
  }
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function dateToMonth(dateStr) {
  if (!dateStr) return 1
  return parseInt(dateStr.slice(5, 7), 10)
}

// ── Sobreposição entre regras de temporada ───────────────────────────────────
// Duas regras ativas podem cobrir a mesma data. O motor resolve isso aplicando a
// ATUALIZADA MAIS RECENTEMENTE — o que tem uma consequência traiçoeira: editar
// uma regra ANTIGA faz ela passar a valer no lugar da nova, sem aviso nenhum.
// Por isso a lista marca qual está realmente em vigor.

// Regra vira 1 ou 2 intervalos na chave mês*100+dia (2 quando atravessa o ano).
function faixas(s) {
  const md = (d) => {
    const [, m, dia] = String(d).slice(0, 10).split('-').map(Number)
    return m * 100 + dia
  }
  const ini = md(s.start_date), fim = md(s.end_date)
  if (!ini || !fim) return []
  return ini <= fim ? [[ini, fim]] : [[ini, 1231], [101, fim]]
}

function seSobrepoe(a, b) {
  // Só concorrem no mesmo escopo: mesma região, ou ambas globais.
  const mesmaRegiao = (a.region_id || null) === (b.region_id || null)
  const umaGlobal   = !a.region_id || !b.region_id
  if (!mesmaRegiao && !umaGlobal) return false
  return faixas(a).some(([i1, f1]) => faixas(b).some(([i2, f2]) => i1 <= f2 && i2 <= f1))
}

// Para cada regra ativa, diz se está em vigor ou se perdeu para outra.
function analisarSobreposicao(seasons) {
  const ativas = (seasons || []).filter((s) => s.is_active)
  const mapa = new Map()
  for (const s of ativas) {
    const rivais = ativas.filter((o) => o.id !== s.id && seSobrepoe(s, o))
    if (rivais.length === 0) { mapa.set(s.id, null); continue }
    const maisRecente = [...rivais, s].sort(
      (x, y) => new Date(y.updated_at || 0) - new Date(x.updated_at || 0),
    )[0]
    mapa.set(s.id, maisRecente.id === s.id ? 'vigora' : 'perdeu')
  }
  return mapa
}

const EMPTY = { region_id: '', start_month: 7, end_month: 1, pct: 10, is_active: true }
const EMPTY_HOLIDAY = { region_id: '', name: '', holiday_date: '', pct: 20, is_active: true }

const fmtDateBR = (iso) => {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export default function Temporada() {
  const [modal, setModal] = useState(null)
  const [form, setForm]   = useState(EMPTY)
  const qc = useQueryClient()

  const { data: seasons = [], isLoading: l1 } = useQuery({ queryKey: ['seasons'],  queryFn: () => api.getSeasons() })
  const { data: regions = [], isLoading: l2 } = useQuery({ queryKey: ['regions'],  queryFn: () => api.getRegions() })

  // Quais regras ativas se sobrepõem e qual delas realmente vale.
  const sobreposicao = analisarSobreposicao(seasons)

  const saveMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createSeason(body) : api.updateSeason(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['seasons'] }); setModal(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.deleteSeason(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['seasons'] }),
  })

  function openNew()   { setForm(EMPTY); setModal({ isNew: true }) }
  function openEdit(s) {
    setForm({
      region_id:   s.region_id || '',
      start_month: dateToMonth(s.start_date),
      end_month:   dateToMonth(s.end_date),
      pct:         Number(s.additional_value),
      is_active:   s.is_active,
    })
    setModal(s)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const sm = Number(form.start_month)
    const em = Number(form.end_month)
    // Rótulo automático ex: "Julho – Janeiro"
    const name = `${MONTHS[sm - 1]} – ${MONTHS[em - 1]}`
    saveMut.mutate({
      name,
      region_id:        form.region_id || null,
      start_date:       monthToDate(sm, false),
      end_date:         monthToDate(em, true, sm),   // sm decide se o fim vira o ano
      additional_type:  'percentage',
      additional_value: Number(form.pct),
      applies_to:       'all',
      is_active:        form.is_active,
    })
  }

  // ── Feriados / datas especiais ──────────────────────────
  const [hmodal, setHmodal] = useState(null)
  const [hform, setHform]   = useState(EMPTY_HOLIDAY)

  const { data: holidays = [] } = useQuery({ queryKey: ['holidays'], queryFn: () => api.getHolidays() })

  const saveHoliday = useMutation({
    mutationFn: (body) => hmodal?.isNew ? api.createHoliday(body) : api.updateHoliday(hmodal.id, body),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['holidays'] }); setHmodal(null) },
  })
  const deleteHoliday = useMutation({
    mutationFn: (id) => api.deleteHoliday(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['holidays'] }),
  })

  function openNewHoliday()    { setHform(EMPTY_HOLIDAY); setHmodal({ isNew: true }) }
  function openEditHoliday(h)  {
    setHform({
      region_id:    h.region_id || '',
      name:         h.name || '',
      holiday_date: h.holiday_date || '',
      pct:          Number(h.additional_value) || 0,
      is_active:    h.is_active,
    })
    setHmodal(h)
  }
  function handleHolidaySubmit(e) {
    e.preventDefault()
    if (!hform.name || !hform.holiday_date) return
    saveHoliday.mutate({
      region_id:            hform.region_id || null,
      name:                 hform.name,
      holiday_date:         hform.holiday_date,
      affects_pricing:      true,
      additional_type:      'percentage',
      additional_value:     Number(hform.pct),
      affects_availability: false,
      is_active:            hform.is_active,
    })
  }

  if (l1 || l2) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus size={16} /> Nova Regra</Button>
      </div>

      <div className="bg-brand/10 border border-brand/20 rounded-xl p-4 text-sm">
        <p className="font-semibold text-brand mb-1">Como funciona</p>
        <p className="text-gray-400 text-xs leading-relaxed">
          Durante a alta temporada, o preço é acrescido automaticamente pelo percentual configurado.
          A regra vale <strong className="text-gray-300">todo ano</strong> (você escolhe só os meses) e pode
          atravessar a virada — ex.: <strong className="text-gray-300">Julho a Janeiro (+10%)</strong>.
        </p>
        <ul className="text-gray-400 text-xs leading-relaxed mt-2 space-y-1 list-disc list-inside">
          <li>
            <strong className="text-gray-300">Feriados e datas especiais têm prioridade</strong>: se a data
            estiver cadastrada ali embaixo, vale o percentual dela — mesmo que seja menor. Os dois nunca somam.
          </li>
          <li>
            Se duas regras cobrirem as mesmas datas, vale a <strong className="text-gray-300">editada por
            último</strong>. Atenção: reeditar uma regra antiga faz ela voltar a valer.
          </li>
        </ul>
      </div>

      {seasons.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-12 text-center">
              <Sun size={36} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma regra de alta temporada.</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-gray-800">
            {seasons.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-lg bg-amber-900/30 flex items-center justify-center text-amber-400 flex-shrink-0">
                  <Sun size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200">{s.name}</p>
                  <p className="text-xs text-gray-500">
                    {s.regions?.name || 'Todas as regiões'} · +{s.additional_value}%
                  </p>
                </div>
                {sobreposicao.get(s.id) === 'perdeu' && (
                  <span
                    title="Outra regra ativa cobre as mesmas datas e foi editada depois — é ela que vale."
                    className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 whitespace-nowrap"
                  >
                    Sobreposta
                  </span>
                )}
                {sobreposicao.get(s.id) === 'vigora' && (
                  <span
                    title="Há outra regra para as mesmas datas, mas esta foi editada por último — é a que vale."
                    className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-400 whitespace-nowrap"
                  >
                    Em vigor
                  </span>
                )}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                  {s.is_active ? 'Ativa' : 'Inativa'}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => confirm('Remover regra?') && deleteMut.mutate(s.id)}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.isNew ? 'Nova Regra de Temporada' : 'Editar Regra'} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select label="Região (vazio = todas)" value={form.region_id} onChange={(e) => setForm({ ...form, region_id: e.target.value })}>
            <option value="">Todas as regiões</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Mês início" value={form.start_month} onChange={(e) => setForm({ ...form, start_month: e.target.value })}>
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </Select>
            <Select label="Mês fim" value={form.end_month} onChange={(e) => setForm({ ...form, end_month: e.target.value })}>
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </Select>
          </div>
          <Input
            label="Acréscimo (%)"
            type="number" min={0} max={200} step={1}
            value={form.pct}
            onChange={(e) => setForm({ ...form, pct: e.target.value })}
            required
          />
          <Button type="submit" className="w-full" disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>

      {/* ── Feriados e datas especiais ── */}
      <div className="flex items-center justify-between pt-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Feriados e datas especiais</h2>
          <p className="text-xs text-gray-500">Dias específicos (feriados, datas comemorativas) com acréscimo próprio.</p>
        </div>
        <Button onClick={openNewHoliday}><Plus size={16} /> Nova Data</Button>
      </div>

      {holidays.length === 0 ? (
        <Card><CardBody>
          <div className="py-10 text-center">
            <CalendarDays size={32} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-500 text-sm">Nenhum feriado ou data especial cadastrada.</p>
          </div>
        </CardBody></Card>
      ) : (
        <Card>
          <div className="divide-y divide-gray-800">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-lg bg-rose-900/30 flex items-center justify-center text-rose-400 flex-shrink-0">
                  <CalendarDays size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200">{h.name}</p>
                  <p className="text-xs text-gray-500">
                    {fmtDateBR(h.holiday_date)} · {h.regions?.name || 'Todas as regiões'} · +{h.additional_value}%
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${h.is_active ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                  {h.is_active ? 'Ativo' : 'Inativo'}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => openEditHoliday(h)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg"><Pencil size={13} /></button>
                  <button onClick={() => confirm('Remover esta data?') && deleteHoliday.mutate(h.id)} className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!hmodal} onClose={() => setHmodal(null)} title={hmodal?.isNew ? 'Nova Data Especial' : 'Editar Data'} size="sm">
        <form onSubmit={handleHolidaySubmit} className="space-y-4">
          <Input label="Nome (ex: Réveillon, Carnaval)" value={hform.name} onChange={(e) => setHform({ ...hform, name: e.target.value })} required />
          <Input label="Data" type="date" value={hform.holiday_date} onChange={(e) => setHform({ ...hform, holiday_date: e.target.value })} required />
          <Select label="Região (vazio = todas)" value={hform.region_id} onChange={(e) => setHform({ ...hform, region_id: e.target.value })}>
            <option value="">Todas as regiões</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Input label="Acréscimo (%)" type="number" min={0} max={300} step={1} value={hform.pct} onChange={(e) => setHform({ ...hform, pct: e.target.value })} required />
          <Button type="submit" className="w-full" disabled={saveHoliday.isPending}>
            {saveHoliday.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
