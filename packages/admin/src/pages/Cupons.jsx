import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Ticket, Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'

const EMPTY = {
  code: '', discount_type: 'percent', discount_value: '', max_uses: '',
  valid_from: '', valid_until: '', service_type: '', min_order_value: '', is_active: true,
}

const fmtDiscount = (c) => {
  if (c.discount_type === 'percent') return `${c.discount_value}%`
  return Number(c.discount_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Cupons() {
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState(EMPTY)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['coupons', search],
    queryFn:  () => api.getCoupons({ ...(search ? { search } : {}) }),
  })

  const saveMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createCoupon(body) : api.updateCoupon(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['coupons'] }); setModal(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.deleteCoupon(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['coupons'] }),
  })

  function openNew()  { setForm(EMPTY); setModal({ isNew: true }) }
  function openEdit(c) {
    setForm({
      code: c.code, discount_type: c.discount_type, discount_value: c.discount_value,
      max_uses: c.max_uses || '', valid_from: c.valid_from?.slice(0, 10) || '',
      valid_until: c.valid_until?.slice(0, 10) || '', service_type: c.service_type || '',
      min_order_value: c.min_order_value || '', is_active: c.is_active,
    })
    setModal(c)
  }

  function handleSubmit(e) {
    e.preventDefault()
    saveMut.mutate({
      ...form,
      discount_value:  Number(form.discount_value),
      max_uses:        form.max_uses    ? Number(form.max_uses)    : null,
      min_order_value: form.min_order_value ? Number(form.min_order_value) : null,
      valid_from:      form.valid_from  || null,
      valid_until:     form.valid_until || null,
      service_type:    form.service_type || null,
    })
  }

  const coupons = data?.data || []

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand"
          />
        </div>
        <Button onClick={openNew} className="ml-auto"><Plus size={16} /> Novo Cupom</Button>
      </div>

      <Card>
        {coupons.length === 0 ? (
          <CardBody>
            <div className="py-12 text-center">
              <Ticket size={36} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">Nenhum cupom encontrado.</p>
            </div>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Código</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Desconto</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Usos</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Validade</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-5 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-750">
                    <td className="px-5 py-3">
                      <span className="font-mono font-bold text-brand">{c.code}</span>
                      {c.service_type && <span className="ml-2 text-xs text-gray-500">({c.service_type})</span>}
                    </td>
                    <td className="px-5 py-3 font-semibold text-gray-200">{fmtDiscount(c)}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {c.times_used ?? 0}{c.max_uses ? ` / ${c.max_uses}` : ' / ∞'}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {c.valid_until ? format(parseISO(c.valid_until), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="px-5 py-3"><Badge value={String(c.is_active)} /></td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => confirm('Desativar cupom?') && deleteMut.mutate(c.id)}
                          className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.isNew ? 'Novo Cupom' : 'Editar Cupom'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Código"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="PRAIA20"
              required
            />
            <Select
              label="Tipo de desconto"
              value={form.discount_type}
              onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
            >
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={form.discount_type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}
              type="number" min={0} step={form.discount_type === 'percent' ? 1 : 0.01}
              max={form.discount_type === 'percent' ? 100 : undefined}
              value={form.discount_value}
              onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
              required
            />
            <Input
              label="Máx. usos (vazio = ilimitado)"
              type="number" min={1}
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Válido de" type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
            <Input label="Válido até" type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Tipo de serviço" value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })}>
              <option value="">Todos</option>
              <option value="tour">Passeios</option>
              <option value="transfer">Transfers</option>
            </Select>
            <Input
              label="Pedido mínimo (R$)"
              type="number" min={0} step={0.01}
              value={form.min_order_value}
              onChange={(e) => setForm({ ...form, min_order_value: e.target.value })}
              placeholder="0"
            />
          </div>
          <Button type="submit" className="w-full" disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Salvando…' : 'Salvar Cupom'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
