import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Pencil, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { api } from '../lib/api'
import Badge from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card from '../components/ui/Card'

const USER_TYPES = ['tourist', 'operator', 'agency', 'admin', 'finance', 'affiliate']

export default function Usuarios() {
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [typeFilter, setType]   = useState('')
  const [activeFilter, setActive] = useState('')
  const [modal, setModal]       = useState(null)
  const [form, setForm]         = useState({})
  const qc                      = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, search, typeFilter, activeFilter],
    queryFn:  () => api.getUsers({
      page,
      limit: 30,
      ...(search      ? { search }           : {}),
      ...(typeFilter  ? { user_type: typeFilter } : {}),
      ...(activeFilter !== '' ? { is_active: activeFilter } : {}),
    }),
    keepPreviousData: true,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }) => api.updateUser(id, body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setModal(null)
    },
  })

  function openEdit(u) {
    setModal(u)
    setForm({ user_type: u.user_type, is_active: u.is_active })
  }

  function handleSubmit(e) {
    e.preventDefault()
    updateMut.mutate({ id: modal.id, ...form, is_active: form.is_active === 'true' || form.is_active === true })
  }

  const users  = data?.data || []
  const total  = data?.total || 0
  const pages  = Math.ceil(total / 30)

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar por nome, e-mail ou telefone…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => { setType(e.target.value); setPage(1) }}
            className="h-9 pl-3 pr-8 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 focus:outline-none focus:border-brand"
          >
            <option value="">Todos os tipos</option>
            {USER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={activeFilter}
            onChange={(e) => { setActive(e.target.value); setPage(1) }}
            className="h-9 pl-3 pr-8 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 focus:outline-none focus:border-brand"
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
          <span className="text-sm text-gray-500 ml-auto">{total} usuários</span>
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Usuário</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cadastro</th>
                <th className="px-5 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-750 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-200">{u.full_name || '—'}</p>
                    <p className="text-xs text-gray-500">{u.email || u.phone || '—'}</p>
                  </td>
                  <td className="px-5 py-3"><Badge value={u.user_type} /></td>
                  <td className="px-5 py-3"><Badge value={String(u.is_active)} /></td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {u.created_at ? format(parseISO(u.created_at), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-600 text-sm">Nenhum resultado</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700">
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft size={15} /> Anterior
            </Button>
            <span className="text-sm text-gray-500">Pág. {page} / {pages}</span>
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}>
              Próxima <ChevronRight size={15} />
            </Button>
          </div>
        )}
      </Card>

      {/* Modal editar */}
      <Modal open={!!modal} onClose={() => setModal(null)} title="Editar Usuário" size="sm">
        {modal && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-gray-900 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-200">{modal.full_name}</p>
              <p className="text-gray-500">{modal.email || modal.phone}</p>
            </div>
            <Select
              label="Tipo"
              value={form.user_type}
              onChange={(e) => setForm({ ...form, user_type: e.target.value })}
            >
              {USER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select
              label="Status"
              value={String(form.is_active)}
              onChange={(e) => setForm({ ...form, is_active: e.target.value })}
            >
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </Select>
            <Button type="submit" className="w-full" disabled={updateMut.isPending}>
              {updateMut.isPending ? 'Salvando…' : 'Salvar Alterações'}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  )
}
