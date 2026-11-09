// ── ParadasPasseio.jsx — Catálogo → Paradas ──────────────────────────────────
//
// A lista que o cliente vê ao escolher as paradas no "Montar meu passeio"
// (migração 127). Fora dela, o cliente escolhe "Outro destino" e escreve — a
// cooperativa avalia. Sem município marcado, a parada aparece em todos.
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, MapPin, Search, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { api } from '../lib/api'
import Button from './ui/Button'
import Modal from './ui/Modal'
import Input, { Textarea } from './ui/Input'
import Card, { CardHeader, CardBody } from './ui/Card'
import MenuAcoes from './ui/MenuAcoes'

const VAZIA = { name: '', description: '', region_ids: [], sort_order: 0, is_active: true }

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function ParadasPasseio() {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(null)   // { isNew: true } | parada
  const [form, setForm] = useState(VAZIA)
  const [busca, setBusca] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['tour-stops-admin'],
    queryFn:  () => api.getTourStopsAdmin(),
    retry:    false,
  })
  const paradas = data?.data || []

  const { data: regionData } = useQuery({ queryKey: ['regions'], queryFn: () => api.getRegions() })
  const municipios = (Array.isArray(regionData) ? regionData : []).filter((r) => r.is_active)
  const nomeDoMunicipio = (id) => municipios.find((r) => r.id === id)?.name

  const atualizar = () => qc.invalidateQueries({ queryKey: ['tour-stops-admin'] })
  const salvar = useMutation({
    mutationFn: (body) => (editando?.isNew ? api.createTourStop(body) : api.updateTourStop(editando.id, body)),
    onSuccess:  () => { atualizar(); setEditando(null) },
    onError:    (err) => alert(err?.message || 'Não foi possível salvar a parada.'),
  })
  const alternar = useMutation({
    mutationFn: ({ id, is_active }) => api.updateTourStop(id, { is_active }),
    onSuccess:  atualizar,
    onError:    (err) => alert(err?.message || 'Não foi possível alterar a parada.'),
  })
  const apagar = useMutation({
    mutationFn: (id) => api.deleteTourStop(id),
    onSuccess:  atualizar,
    onError:    (err) => alert(err?.message || 'Não foi possível apagar a parada.'),
  })

  const visiveis = useMemo(() => {
    const q = semAcento(busca).trim()
    return q ? paradas.filter((p) => semAcento(`${p.name} ${p.description || ''}`).includes(q)) : paradas
  }, [paradas, busca])
  const ativas = paradas.filter((p) => p.is_active).length

  function abrirNova() {
    const proxima = paradas.reduce((m, p) => Math.max(m, Number(p.sort_order) || 0), 0) + 1
    setForm({ ...VAZIA, sort_order: proxima })
    setEditando({ isNew: true })
  }
  function abrirEdicao(p) {
    setForm({ name: p.name, description: p.description || '', region_ids: p.region_ids || [], sort_order: p.sort_order || 0, is_active: p.is_active })
    setEditando(p)
  }
  function enviar(e) {
    e.preventDefault()
    if (!form.name.trim()) { alert('Informe o nome da parada.'); return }
    salvar.mutate({
      name:        form.name.trim(),
      description: form.description.trim() || null,
      region_ids:  form.region_ids,
      sort_order:  Number(form.sort_order) || 0,
      is_active:   !!form.is_active,
    })
  }

  const livres = municipios.filter((r) => !form.region_ids.includes(r.id))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-300">
                Paradas do “Montar meu passeio” {paradas.length > 0 && <span className="text-gray-500">({ativas}/{paradas.length} ativas)</span>}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                O cliente escolhe as paradas nesta lista. Se não achar o lugar, toca em “Outro destino”, escreve, e a cooperativa avalia.
              </p>
            </div>
            <Button size="sm" onClick={abrirNova}><Plus size={14} /> Nova parada</Button>
          </div>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <p className="text-sm text-gray-500">Carregando…</p>
          ) : error ? (
            <p className="text-sm text-amber-400">{error.message || 'Não foi possível carregar as paradas.'}</p>
          ) : paradas.length === 0 ? (
            <div className="py-8 text-center">
              <MapPin size={30} className="mx-auto text-gray-700 mb-2" />
              <p className="text-sm text-gray-500">Nenhuma parada cadastrada.</p>
              <p className="text-xs text-gray-600 mt-1">Sem lista, o cliente só consegue escrever o destino (“Outro destino”).</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar parada…"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-brand/60" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {visiveis.map((p) => {
                  const nomes = (p.region_ids || []).map(nomeDoMunicipio).filter(Boolean)
                  return (
                    <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl bg-gray-900/40 border border-gray-700/60 ${p.is_active ? '' : 'opacity-50'}`}>
                      <span className="w-7 text-center text-xs font-semibold text-gray-500 tabular-nums shrink-0">{p.sort_order}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 truncate">{p.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {p.description ? `${p.description} · ` : ''}{nomes.length ? nomes.join(' · ') : 'Todos os municípios'}
                        </p>
                      </div>
                      <button type="button" onClick={() => alternar.mutate({ id: p.id, is_active: !p.is_active })}
                        title={p.is_active ? 'Tirar da lista do app' : 'Mostrar no app'} aria-label={p.is_active ? `Desativar ${p.name}` : `Ativar ${p.name}`}
                        className="shrink-0">
                        {p.is_active ? <ToggleRight size={20} className="text-brand" /> : <ToggleLeft size={20} className="text-gray-600" />}
                      </button>
                      <MenuAcoes
                        onEdit={() => abrirEdicao(p)}
                        onDelete={() => { if (confirm(`Apagar a parada "${p.name}"? Pedidos já feitos continuam com o nome.`)) apagar.mutate(p.id) }}
                        deleteLabel="Apagar"
                      />
                    </div>
                  )
                })}
              </div>
              {visiveis.length === 0 && <p className="text-sm text-gray-500">Nenhuma parada com “{busca}”.</p>}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal open={!!editando} onClose={() => setEditando(null)} title={editando?.isNew ? 'Nova parada' : 'Editar parada'} size="sm">
        <form onSubmit={enviar} className="space-y-4">
          <Input label="Nome" value={form.name} maxLength={150} autoFocus required
            placeholder="ex.: Lagoa do Paraíso"
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Textarea label="Descrição (opcional)" rows={2} value={form.description} maxLength={300}
            placeholder="Aparece embaixo do nome no app"
            onChange={(e) => setForm({ ...form, description: e.target.value })} />

          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">
              Municípios <span className="font-normal text-gray-600">(vazio = aparece em todos)</span>
            </p>
            {form.region_ids.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {form.region_ids.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 bg-brand/20 text-brand text-xs font-medium px-2.5 py-1 rounded-full">
                    {nomeDoMunicipio(id) || 'Município'}
                    <button type="button" aria-label={`Tirar ${nomeDoMunicipio(id) || 'município'}`}
                      onClick={() => setForm({ ...form, region_ids: form.region_ids.filter((x) => x !== id) })}
                      className="ml-0.5 text-brand/60 hover:text-brand">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {livres.length > 0 && (
              <select value="" onChange={(e) => { if (e.target.value) setForm({ ...form, region_ids: [...form.region_ids, e.target.value] }) }}
                className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 focus:outline-none focus:border-brand">
                <option value="">+ Adicionar município…</option>
                {livres.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </div>

          <Input label="Ordem na lista" type="number" min={0} value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />

          <button type="button" onClick={() => setForm({ ...form, is_active: !form.is_active })}
            className="w-full flex items-center justify-between bg-gray-800/50 rounded-xl px-3.5 py-2.5">
            <span className="text-sm text-gray-200">{form.is_active ? 'Aparece no app' : 'Fora do app (desativada)'}</span>
            {form.is_active ? <ToggleRight size={22} className="text-brand" /> : <ToggleLeft size={22} className="text-gray-600" />}
          </button>

          <Button type="submit" className="w-full" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar parada'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
