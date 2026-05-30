import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Pencil, ChevronLeft, ChevronRight, UserPlus, Landmark, CheckCircle2, AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { api } from '../lib/api'
import Badge from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card from '../components/ui/Card'

const USER_TYPES = ['tourist', 'operator', 'agency', 'admin', 'finance', 'affiliate']

const USER_TYPE_LABELS = {
  tourist:   'Turista',
  operator:  'Operador (Cooperativa)',
  agency:    'Agência',
  admin:     'Administrador',
  finance:   'Financeiro',
  affiliate: 'Afiliado',
}

const CREATE_EMPTY = { full_name: '', email: '', phone: '', password: '', user_type: 'tourist' }

export default function Usuarios() {
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [typeFilter, setType]     = useState('')
  const [activeFilter, setActive] = useState('')
  const [modal, setModal]         = useState(null)   // null | { mode: 'edit', user } | { mode: 'create' }
  const [form, setForm]           = useState({})
  const [createForm, setCreateForm] = useState(CREATE_EMPTY)
  const qc                        = useQueryClient()

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

  const createMut = useMutation({
    mutationFn: (body) => api.createUser(body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setModal(null)
      setCreateForm(CREATE_EMPTY)
    },
  })

  const recipientMut = useMutation({
    mutationFn: (id) => api.registerRecipient(id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      // Update snapshot in modal so badge updates immediately
      if (modal?.mode === 'edit') {
        setModal((m) => ({ ...m, user: { ...m.user, gateway_recipient_id: result?.recipient_id } }))
      }
    },
  })

  function openEdit(u) {
    setModal({ mode: 'edit', user: u })
    setForm({ user_type: u.user_type, is_active: u.is_active })
  }

  function openCreate() {
    setModal({ mode: 'create' })
    setCreateForm(CREATE_EMPTY)
  }

  function handleSubmit(e) {
    e.preventDefault()
    updateMut.mutate({ id: modal.user.id, ...form, is_active: form.is_active === 'true' || form.is_active === true })
  }

  function handleCreate(e) {
    e.preventDefault()
    const body = {
      full_name: createForm.full_name,
      password:  createForm.password,
      user_type: createForm.user_type,
      ...(createForm.email ? { email: createForm.email } : {}),
      ...(createForm.phone ? { phone: createForm.phone } : {}),
    }
    createMut.mutate(body)
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
          <span className="text-sm text-gray-500">{total} usuários</span>
          <Button size="sm" onClick={openCreate} className="ml-auto gap-1.5">
            <UserPlus size={14} />
            Novo Usuário
          </Button>
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
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <Badge value={u.user_type} />
                      {u.user_type === 'operator' && (
                        u.gateway_recipient_id
                          ? <CheckCircle2 size={13} className="text-green-400" title="Recebimento ativo" />
                          : <AlertCircle  size={13} className="text-amber-400" title="Recebimento não configurado" />
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3"><Badge value={String(u.is_active)} /></td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {u.created_at ? format(parseISO(u.created_at), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                      title="Editar usuário"
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

      {/* Modal criar usuário */}
      <Modal
        open={modal?.mode === 'create'}
        onClose={() => setModal(null)}
        title="Novo Usuário"
        size="sm"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Nome completo"
            value={createForm.full_name}
            onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
            required
          />
          <Input
            label="E-mail"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            placeholder="Obrigatório se não informar telefone"
          />
          <Input
            label="Telefone / WhatsApp"
            value={createForm.phone}
            onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
            placeholder="+55 88 99999-9999"
          />
          <Input
            label="Senha inicial"
            type="password"
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            required
            minLength={6}
            placeholder="Mínimo 6 caracteres"
          />
          <Select
            label="Função na plataforma"
            value={createForm.user_type}
            onChange={(e) => setCreateForm({ ...createForm, user_type: e.target.value })}
          >
            {USER_TYPES.map((t) => (
              <option key={t} value={t}>{USER_TYPE_LABELS[t]}</option>
            ))}
          </Select>
          {createMut.isError && (
            <p className="text-sm text-red-400">{createMut.error?.message || 'Erro ao criar usuário'}</p>
          )}
          <Button type="submit" className="w-full" disabled={createMut.isPending}>
            {createMut.isPending ? 'Criando…' : 'Criar Usuário'}
          </Button>
        </form>
      </Modal>

      {/* Modal editar */}
      <Modal
        open={modal?.mode === 'edit'}
        onClose={() => setModal(null)}
        title="Editar Usuário"
        size="sm"
      >
        {modal?.mode === 'edit' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-gray-900 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-200">{modal.user.full_name}</p>
              <p className="text-gray-500">{modal.user.email || modal.user.phone}</p>
            </div>
            <Select
              label="Função na plataforma"
              value={form.user_type}
              onChange={(e) => setForm({ ...form, user_type: e.target.value })}
            >
              {USER_TYPES.map((t) => (
                <option key={t} value={t}>{USER_TYPE_LABELS[t]}</option>
              ))}
            </Select>
            <Select
              label="Status"
              value={String(form.is_active)}
              onChange={(e) => setForm({ ...form, is_active: e.target.value })}
            >
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </Select>
            {/* Recebimento — só para operadores */}
            {modal?.mode === 'edit' && modal.user.user_type === 'operator' && (
              <div className="border border-gray-700 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Landmark size={14} className="text-gray-500" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Recebimento no gateway</p>
                </div>

                {modal.user.gateway_recipient_id ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-green-400">Ativo</p>
                      <p className="text-[10px] text-gray-600 font-mono break-all">{modal.user.gateway_recipient_id}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {modal.user.pix_key ? (
                      <>
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <AlertCircle size={12} className="text-amber-400 shrink-0" />
                          Cooperativa não registrada no gateway
                        </div>
                        <p className="text-[11px] text-gray-600">
                          Chave PIX: <span className="text-gray-300 font-mono">{modal.user.pix_key}</span>
                        </p>
                        {recipientMut.isError && (
                          <p className="text-xs text-red-400">{recipientMut.error?.message}</p>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          className="w-full"
                          disabled={recipientMut.isPending}
                          onClick={() => recipientMut.mutate(modal.user.id)}
                        >
                          {recipientMut.isPending ? 'Registrando…' : 'Registrar no gateway'}
                        </Button>
                      </>
                    ) : (
                      <p className="text-xs text-gray-600">
                        Cooperativa ainda não cadastrou sua chave PIX no perfil.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {updateMut.isError && (
              <p className="text-sm text-red-400">{updateMut.error?.message || 'Erro ao salvar'}</p>
            )}
            <Button type="submit" className="w-full" disabled={updateMut.isPending}>
              {updateMut.isPending ? 'Salvando…' : 'Salvar Alterações'}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  )
}
