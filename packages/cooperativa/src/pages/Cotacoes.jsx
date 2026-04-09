import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Clock, MapPin, Users, DollarSign, MessageSquare } from 'lucide-react'
import { api } from '../lib/api'
import Badge from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'
import Card from '../components/ui/Card'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (s) => {
  try { return format(parseISO(s), "dd/MM/yy 'às' HH:mm", { locale: ptBR }) } catch { return s }
}

const TABS = [
  { key: 'pending_quote', label: 'Pendentes' },
  { key: 'quoted',        label: 'Cotadas'   },
  { key: 'accepted',      label: 'Aceitas'   },
  { key: 'expired',       label: 'Expiradas' },
]

export default function Cotacoes() {
  const [tab, setTab]         = useState('pending_quote')
  const [modal, setModal]     = useState(null)
  const [price, setPrice]     = useState('')
  const [notes, setNotes]     = useState('')
  const qc                    = useQueryClient()

  const { data: pending = [], isLoading: loadPending } = useQuery({
    queryKey: ['quotes-pending'],
    queryFn:  () => api.getPendingQuotes(),
    refetchInterval: 20_000,
  })

  const { data: all = [], isLoading: loadAll } = useQuery({
    queryKey: ['quotes-all'],
    queryFn:  () => api.getAllQuotes(),
  })

  const setQuoteMut = useMutation({
    mutationFn: ({ id, quoted_price, operator_notes }) =>
      api.setQuotePrice(id, { quoted_price: Number(quoted_price), operator_notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes-pending'] })
      qc.invalidateQueries({ queryKey: ['quotes-all'] })
      setModal(null)
      setPrice('')
      setNotes('')
    },
  })

  const allQuotes = Array.isArray(all) ? all : (all?.data || [])
  const byStatus  = (status) => {
    if (status === 'pending_quote') return Array.isArray(pending) ? pending : (pending?.data || [])
    return allQuotes.filter((q) => q.status === status)
  }

  const rows = byStatus(tab)
  const loading = loadPending || loadAll

  function handleSetPrice(e) {
    e.preventDefault()
    if (!price || isNaN(Number(price))) return
    setQuoteMut.mutate({ id: modal.id, quoted_price: price, operator_notes: notes })
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.key === 'pending_quote' && byStatus('pending_quote').length > 0 && (
              <span className="ml-1.5 bg-brand text-white text-xs rounded-full px-1.5 py-0.5">
                {byStatus('pending_quote').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <Card>
        {rows.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            Nenhuma cotação neste status
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {rows.map((q) => (
              <div key={q.id} className="p-4 flex items-start justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                <div className="min-w-0 flex-1 space-y-1.5">
                  {/* Cliente + status */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {q.users?.full_name || q.user_name || 'Cliente'}
                    </span>
                    <Badge value={q.status} />
                  </div>

                  {/* Origem / Destino */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <MapPin size={12} className="flex-shrink-0" />
                    <span className="truncate">
                      {q.origin_description || '—'} → {q.destination_description || '—'}
                    </span>
                  </div>

                  {/* Data + Passageiros */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {q.service_date} {q.service_time?.slice(0, 5)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {q.passengers} pax
                    </span>
                    {q.quoted_price && (
                      <span className="flex items-center gap-1 text-green-700 font-medium">
                        <DollarSign size={12} />
                        {fmt(q.quoted_price)}
                      </span>
                    )}
                  </div>

                  {q.client_notes && (
                    <p className="text-xs text-gray-400 italic flex items-start gap-1">
                      <MessageSquare size={11} className="mt-0.5 flex-shrink-0" />
                      {q.client_notes}
                    </p>
                  )}
                  <p className="text-xs text-gray-300">Solicitado {fmtDate(q.created_at)}</p>
                </div>

                {/* Ação */}
                {tab === 'pending_quote' && (
                  <Button size="sm" onClick={() => setModal(q)}>
                    Cotar
                  </Button>
                )}
                {tab === 'quoted' && (
                  <div className="text-right text-xs text-gray-400">
                    <p>Expira</p>
                    <p>{fmtDate(q.expires_at)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal cotar */}
      <Modal open={!!modal} onClose={() => setModal(null)} title="Definir Preço da Cotação" size="sm">
        {modal && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium text-gray-900">{modal.users?.full_name || 'Cliente'}</p>
              <p className="text-gray-500">
                {modal.origin_description} → {modal.destination_description}
              </p>
              <p className="text-gray-500">
                {modal.service_date} {modal.service_time?.slice(0, 5)} · {modal.passengers} pax
              </p>
            </div>

            <form onSubmit={handleSetPrice} className="space-y-3">
              <Input
                label="Preço (R$)"
                type="number"
                min="1"
                step="0.01"
                placeholder="0,00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                autoFocus
              />
              <Textarea
                label="Observações para o cliente"
                rows={2}
                placeholder="Inclui bagagem, ar-condicionado…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={setQuoteMut.isPending}>
                {setQuoteMut.isPending ? 'Enviando…' : 'Enviar Cotação'}
              </Button>
            </form>
          </div>
        )}
      </Modal>
    </div>
  )
}
