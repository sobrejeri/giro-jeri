import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Pencil, ChevronLeft, ChevronRight, UserPlus, Landmark, CheckCircle2, AlertCircle,
  KeyRound, Copy, UserCheck, Settings2, ToggleRight, ToggleLeft, Car, Users,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { api } from '../lib/api'
import Badge from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card from '../components/ui/Card'
import { fleetCopy } from '../copy/fleet'

const USER_TYPES = ['tourist', 'operator', 'agency', 'admin', 'finance', 'affiliate']

const VEHICLE_TYPE_LABEL = {
  buggy:      'Buggy',
  jardineira: 'Jardineira',
  hilux_4x4:  'Hilux 4x4',
  boat:       'Barco',
  van:        'Van',
  sedan:      'Sedan',
  suv:        'SUV',
  other:      'Outro',
}

const USER_TYPE_LABELS = {
  tourist:   'Turista',
  operator:  'Operador (Operador)',
  agency:    'Agência',
  admin:     'Administrador',
  finance:   'Financeiro',
  affiliate: 'Afiliado',
}

const CREATE_EMPTY = { full_name: '', email: '', phone: '', cnpj: '', password: '', user_type: 'tourist' }
const IMPORT_EMPTY = { full_name: '', user_type: 'tourist', cnpj: '' }

function genPassword(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function Usuarios() {
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [typeFilter, setType]     = useState('')
  const [activeFilter, setActive] = useState('')
  const [modal, setModal]         = useState(null)   // null | { mode: 'edit', user } | { mode: 'create' } | { mode: 'reset', user }
  const [form, setForm]           = useState({})
  const [createForm, setCreateForm] = useState(CREATE_EMPTY)
  const [resetPwd, setResetPwd]     = useState('')
  const [resetCopied, setResetCopied] = useState(false)
  const [importForm, setImportForm]   = useState(IMPORT_EMPTY)
  const qc                            = useQueryClient()

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

  const resetMut = useMutation({
    mutationFn: ({ id, new_password }) => api.resetUserPassword(id, new_password),
    onSuccess: () => {
      // Mantém o modal aberto para mostrar a senha; admin fecha manualmente
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

  // Resumo da frota liberada — só busca quando o modal de edição está aberto
  // para um operador (a mesma queryKey é reaproveitada pelo modal nível 2).
  const fleetOperatorId = modal?.mode === 'edit' && modal.user.user_type === 'operator' ? modal.user.id : null
  const {
    data: fleetSummary = [],
    isLoading: fleetSummaryLoading,
    isError: fleetSummaryError,
  } = useQuery({
    queryKey: ['admin-operator-vehicles', fleetOperatorId],
    queryFn:  () => api.getOperatorVehicles(fleetOperatorId),
    enabled:  !!fleetOperatorId,
  })

  const { data: integrity } = useQuery({
    queryKey: ['auth-orphans'],
    queryFn:  () => api.getAuthOrphans(),
  })
  const orphans  = integrity?.orphans  ?? (Array.isArray(integrity) ? integrity : [])
  const unlinked = integrity?.unlinked ?? []

  const importMut = useMutation({
    mutationFn: (body) => api.importAuthUser(body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['auth-orphans'] })
      setModal(null)
      setImportForm(IMPORT_EMPTY)
    },
  })

  function openImport(orphan) {
    setModal({ mode: 'import', orphan })
    setImportForm({ full_name: orphan.email?.split('@')[0] || '', user_type: 'tourist', cnpj: '' })
  }

  function handleImport(e) {
    e.preventDefault()
    importMut.mutate({
      auth_id:   modal.orphan.auth_id,
      full_name: importForm.full_name,
      user_type: importForm.user_type,
      ...(importForm.user_type === 'operator' ? { cnpj: importForm.cnpj } : {}),
    })
  }

  function openEdit(u) {
    setModal({ mode: 'edit', user: u })
    setForm({ user_type: u.user_type, is_active: u.is_active })
  }

  function openFleet(u) {
    setModal({ mode: 'fleet', user: u })
  }

  function openCreate() {
    setModal({ mode: 'create' })
    setCreateForm(CREATE_EMPTY)
  }

  function openReset(u) {
    setModal({ mode: 'reset', user: u })
    setResetPwd(genPassword())
    setResetCopied(false)
    resetMut.reset()
  }

  function handleResetSubmit(e) {
    e.preventDefault()
    if (!resetPwd || resetPwd.length < 6) return
    resetMut.mutate({ id: modal.user.id, new_password: resetPwd })
  }

  function copyPwd() {
    navigator.clipboard?.writeText(resetPwd)
    setResetCopied(true)
    setTimeout(() => setResetCopied(false), 1500)
  }

  function handleSubmit(e) {
    e.preventDefault()
    updateMut.mutate({ id: modal.user.id, ...form, is_active: form.is_active === 'true' || form.is_active === true })
  }

  function handleCreate(e) {
    e.preventDefault()
    const isOp = createForm.user_type === 'operator'
    const body = {
      full_name: createForm.full_name,
      password:  createForm.password,
      user_type: createForm.user_type,
      ...(isOp
        ? { cnpj: createForm.cnpj }
        : {
            ...(createForm.email ? { email: createForm.email } : {}),
            ...(createForm.phone ? { phone: createForm.phone } : {}),
          }),
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
                    <p className="text-xs text-gray-500">
                      {u.user_type === 'operator' && u.document_number
                        ? `${String(u.document_number).replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ'}: ${u.document_number}`
                        : u.email || u.phone || '—'}
                    </p>
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

      {/* Usuários Auth sem perfil */}
      {orphans.length > 0 && (
        <Card className="border-amber-900/40">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-400 shrink-0" />
            <h3 className="text-sm font-semibold text-amber-300">
              {orphans.length} usuário{orphans.length > 1 ? 's' : ''} no Auth sem perfil
            </h3>
            <span className="text-xs text-gray-500 ml-1">
              Criados via Supabase Dashboard — clique em "Importar" para vincular
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">E-mail / Telefone</th>
                  <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Criado em</th>
                  <th className="px-5 py-2 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {orphans.map((o) => (
                  <tr key={o.auth_id} className="hover:bg-gray-750 transition-colors">
                    <td className="px-5 py-2 text-gray-300">{o.email || o.phone || '—'}</td>
                    <td className="px-5 py-2 text-xs text-gray-500">
                      {o.created_at ? format(parseISO(o.created_at), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="px-5 py-2">
                      <button
                        onClick={() => openImport(o)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-amber-900/30 text-amber-300 hover:bg-amber-900/50 transition-colors"
                      >
                        <UserCheck size={12} /> Importar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Perfis sem Auth válido */}
      {unlinked.length > 0 && (
        <Card className="border-red-900/40">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-2">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <h3 className="text-sm font-semibold text-red-300">
              {unlinked.length} perfil{unlinked.length > 1 ? 's' : ''} sem autenticação válida
            </h3>
            <span className="text-xs text-gray-500 ml-1">
              auth_id ausente ou não existe no Supabase Auth — login impossível
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                  <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">E-mail</th>
                  <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                  <th className="px-5 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Problema</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {unlinked.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-750 transition-colors">
                    <td className="px-5 py-2 text-gray-300">{u.full_name || '—'}</td>
                    <td className="px-5 py-2 text-gray-400 text-xs">{u.email || '—'}</td>
                    <td className="px-5 py-2"><Badge value={u.user_type} /></td>
                    <td className="px-5 py-2 text-xs text-red-400">{u.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Todos ok */}
      {orphans.length === 0 && unlinked.length === 0 && integrity && (
        <Card className="border-green-900/40">
          <div className="px-5 py-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            <p className="text-sm text-green-300">
              Todos os usuários estão corretamente vinculados entre Auth e perfil.
            </p>
          </div>
        </Card>
      )}

      {/* Modal importar usuário Auth */}
      <Modal
        open={modal?.mode === 'import'}
        onClose={() => setModal(null)}
        title="Importar Usuário do Auth"
        size="sm"
      >
        {modal?.mode === 'import' && (
          <form onSubmit={handleImport} className="space-y-4">
            <div className="bg-gray-900 rounded-lg p-3 text-sm">
              <p className="text-gray-400">Auth e-mail:</p>
              <p className="font-medium text-gray-200">{modal.orphan.email || modal.orphan.phone || '—'}</p>
            </div>
            <Input
              label="Nome completo"
              value={importForm.full_name}
              onChange={(e) => setImportForm({ ...importForm, full_name: e.target.value })}
              required
            />
            <Select
              label="Função na plataforma"
              value={importForm.user_type}
              onChange={(e) => setImportForm({ ...importForm, user_type: e.target.value, cnpj: '' })}
            >
              {USER_TYPES.map((t) => (
                <option key={t} value={t}>{USER_TYPE_LABELS[t]}</option>
              ))}
            </Select>
            {importForm.user_type === 'operator' && (
              <Input
                label="CNPJ ou CPF"
                value={importForm.cnpj}
                onChange={(e) => setImportForm({ ...importForm, cnpj: e.target.value })}
                placeholder="CNPJ (operador) ou CPF (operador pessoa física)"
                inputMode="numeric"
                required
              />
            )}
            {importMut.isError && (
              <p className="text-sm text-red-400">{importMut.error?.message || 'Erro ao importar'}</p>
            )}
            <Button type="submit" className="w-full" disabled={importMut.isPending}>
              {importMut.isPending ? 'Importando…' : 'Criar Perfil e Vincular'}
            </Button>
          </form>
        )}
      </Modal>

      {/* Modal criar usuário */}
      <Modal
        open={modal?.mode === 'create'}
        onClose={() => setModal(null)}
        title="Novo Usuário"
        size="sm"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Select
            label="Função na plataforma"
            value={createForm.user_type}
            onChange={(e) => setCreateForm({ ...createForm, user_type: e.target.value, email: '', phone: '', cnpj: '' })}
          >
            {USER_TYPES.map((t) => (
              <option key={t} value={t}>{USER_TYPE_LABELS[t]}</option>
            ))}
          </Select>
          <Input
            label="Nome completo"
            value={createForm.full_name}
            onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
            required
          />
          {createForm.user_type === 'operator' ? (
            <Input
              label="CNPJ ou CPF"
              value={createForm.cnpj}
              onChange={(e) => setCreateForm({ ...createForm, cnpj: e.target.value })}
              placeholder="CNPJ (operador) ou CPF (operador pessoa física)"
              inputMode="numeric"
              required
            />
          ) : (
            <>
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
            </>
          )}
          <Input
            label="Senha inicial"
            type="password"
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            required
            minLength={6}
            placeholder="Mínimo 6 caracteres"
          />
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
                          Operador não registrada no gateway
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
                        Operador ainda não cadastrou sua chave PIX no perfil.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Frota liberada — só para operadores */}
            {modal?.mode === 'edit' && modal.user.user_type === 'operator' && (
              <div className="border border-gray-700 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Settings2 size={14} className="text-gray-500" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{fleetCopy.sectionTitle}</p>
                </div>

                {fleetSummaryLoading ? (
                  <p className="text-xs text-gray-500">{fleetCopy.loading}</p>
                ) : fleetSummaryError ? (
                  <p className="text-xs text-red-400">{fleetCopy.loadError}</p>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400">
                      {fleetCopy.summary(
                        fleetSummary.filter((v) => v.is_active !== false).length,
                        fleetSummary.length,
                      )}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-1.5 shrink-0"
                      onClick={() => openFleet(modal.user)}
                    >
                      <Settings2 size={13} /> {fleetCopy.manage}
                    </Button>
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

            <button
              type="button"
              onClick={() => openReset(modal.user)}
              className="flex items-center justify-center gap-1.5 w-full text-xs text-gray-400 hover:text-amber-400 py-2"
            >
              <KeyRound size={13} />
              Redefinir senha
            </button>
          </form>
        )}
      </Modal>

      {/* Modal redefinir senha */}
      <Modal
        open={modal?.mode === 'reset'}
        onClose={() => setModal(null)}
        title="Redefinir Senha"
        size="sm"
      >
        {modal?.mode === 'reset' && (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div className="bg-gray-900 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-200">{modal.user.full_name}</p>
              <p className="text-gray-500 text-xs">
                {modal.user.user_type === 'operator' && modal.user.document_number
                  ? `CNPJ: ${modal.user.document_number}`
                  : modal.user.email || modal.user.phone}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Nova senha</label>
              <div className="flex gap-2">
                <input
                  value={resetPwd}
                  onChange={(e) => setResetPwd(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-100 font-mono focus:outline-none focus:border-brand"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={copyPwd}
                  title="Copiar"
                  className="px-3 rounded-lg border border-gray-700 bg-gray-900 text-gray-400 hover:text-brand"
                >
                  {resetCopied ? <CheckCircle2 size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => setResetPwd(genPassword())}
                  className="px-3 rounded-lg border border-gray-700 bg-gray-900 text-xs text-gray-400 hover:text-brand"
                >
                  Gerar
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Mínimo 6 caracteres. Copie e envie ao usuário por canal seguro.</p>
            </div>

            {resetMut.isError && (
              <p className="text-sm text-red-400">{resetMut.error?.message || 'Erro ao redefinir'}</p>
            )}
            {resetMut.isSuccess && (
              <p className="text-sm text-green-400 bg-green-900/20 px-3 py-2 rounded-lg">
                Senha atualizada. Envie a nova senha ao usuário.
              </p>
            )}

            <Button type="submit" className="w-full" disabled={resetMut.isPending}>
              {resetMut.isPending ? 'Atualizando…' : 'Confirmar Nova Senha'}
            </Button>
          </form>
        )}
      </Modal>

      {/* Modal nível 2: gerenciar frota liberada do operador */}
      <FleetManagerModal
        open={modal?.mode === 'fleet'}
        operatorId={modal?.mode === 'fleet' ? modal.user.id : null}
        operatorName={modal?.mode === 'fleet' ? (modal.user.full_name || '—') : ''}
        onClose={() => setModal(null)}
      />
    </div>
  )
}

// ── Modal nível 2: gerencia a frota liberada de um operador ───────────
// Auto-save por linha (otimista): cada toggle dispara sua própria mutation;
// erro reverte o cache e mostra mensagem na linha; sucesso mostra micro-texto
// que some em ~1.5s. O contador do rodapé reflete o cache ao vivo.
function FleetManagerModal({ open, operatorId, operatorName, onClose }) {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [savedId, setSavedId] = useState(null)
  // A escolha do dia a dia é por CATEGORIA (migration 076). O veículo a veículo
  // vira ajuste fino e nasce recolhido: com a frota crescendo era uma lista
  // longa de chaves competindo com o controle que realmente importa.
  const [mostrarVeiculos, setMostrarVeiculos] = useState(false)
  const [errorRow, setErrorRow] = useState(null) // { id, message }
  const savedTimer = useRef(null)

  const queryKey = ['admin-operator-vehicles', operatorId]

  const { data: vehicles = [], isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn:  () => api.getOperatorVehicles(operatorId),
    enabled:  open && !!operatorId,
  })

  // MODAIS operados — o corte grosso. Fica ACIMA da lista de veículos porque é
  // por aqui que a escolha começa: "este operador faz terrestre" resolve
  // numa chave o que antes eram dezenas.
  const modalsKey = ['admin-operator-modals', operatorId]
  const { data: modais = [] } = useQuery({
    queryKey: modalsKey,
    queryFn:  () => api.getOperatorModals(operatorId),
    enabled:  open && !!operatorId,
  })

  // Perfil de COMBO (077). Vem junto na lista de modais.
  const aceitaCombo = modais.length > 0 ? modais[0].accepts_combos !== false : true
  const meiosOperados = modais.filter((m) => m.is_active !== false).length

  const comboMut = useMutation({
    mutationFn: (accepts_combos) => api.setOperatorCombos(operatorId, { accepts_combos }),
    onMutate: async (accepts_combos) => {
      setErrorRow(null)
      await qc.cancelQueries({ queryKey: modalsKey })
      const previous = qc.getQueryData(modalsKey)
      qc.setQueryData(modalsKey, (old = []) => old.map((m) => ({ ...m, accepts_combos })))
      return { previous }
    },
    onError: (err, _v, context) => {
      if (context?.previous) qc.setQueryData(modalsKey, context.previous)
      setErrorRow({ id: 'combo', message: err.message || fleetCopy.saveError })
    },
  })

  const modalToggleMut = useMutation({
    mutationFn: ({ modalId, is_active }) => api.setOperatorModal(operatorId, modalId, { is_active }),
    onMutate: async ({ modalId, is_active }) => {
      setErrorRow(null)
      await qc.cancelQueries({ queryKey: modalsKey })
      const previous = qc.getQueryData(modalsKey)
      qc.setQueryData(modalsKey, (old = []) =>
        old.map((m) => (m.modal_id === modalId ? { ...m, is_active } : m)))
      return { previous }
    },
    onError: (err, variables, context) => {
      if (context?.previous) qc.setQueryData(modalsKey, context.previous)
      setErrorRow({ id: variables.modalId, message: err.message || fleetCopy.saveError })
    },
    onSuccess: (_d, variables) => {
      setSavedId(variables.modalId)
      clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSavedId(null), 1500)
    },
  })

  const toggleMut = useMutation({
    mutationFn: ({ vehicleId, is_active }) => api.setOperatorVehicle(operatorId, vehicleId, { is_active }),
    onMutate: async ({ vehicleId, is_active }) => {
      setErrorRow(null)
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData(queryKey)
      qc.setQueryData(queryKey, (old = []) =>
        old.map((v) => (v.vehicle_id === vehicleId ? { ...v, is_active } : v)))
      return { previous }
    },
    onError: (err, variables, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous)
      setErrorRow({ id: variables.vehicleId, message: err.message || fleetCopy.saveError })
    },
    onSuccess: (_data, variables) => {
      setSavedId(variables.vehicleId)
      clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSavedId(null), 1500)
    },
  })

  useEffect(() => {
    if (!open) { setSearch(''); setSavedId(null); setErrorRow(null) }
  }, [open])
  useEffect(() => () => clearTimeout(savedTimer.current), [])

  const filtered = search
    ? vehicles.filter((v) => v.name?.toLowerCase().includes(search.toLowerCase()))
    : vehicles
  const releasedCount = vehicles.filter((v) => v.is_active !== false).length

  return (
    <Modal open={open} onClose={onClose} title={fleetCopy.modalTitle(operatorName)} size="md">
      <div className="space-y-3">
        <p className="text-xs text-gray-500">{fleetCopy.modalHint}</p>

        {/* Modais operados. Some se a migration 075 ainda não rodou (a API
            devolve lista vazia), e aí a tela fica como era antes. */}
        {modais.length > 0 && (
          <div className="rounded-xl border border-gray-700 bg-gray-900/40 p-3">
            <p className="text-xs font-semibold text-gray-300">Em que meios este operador opera</p>
            <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
              Desmarcar um meio já tira o operador de todas as solicitações dele —
              sem precisar mexer veículo por veículo abaixo.
            </p>
            <div className="space-y-1.5">
              {modais.map((m) => {
                const ligado  = m.is_active !== false
                const salvando = modalToggleMut.isPending && modalToggleMut.variables?.modalId === m.modal_id
                return (
                  <div key={m.modal_id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200">{m.name}</p>
                      <p className="text-[11px] text-gray-500">
                        {m.vehicle_count} veículo{m.vehicle_count === 1 ? '' : 's'}
                        {m.description ? ` · ${m.description}` : ''}
                      </p>
                      {errorRow?.id === m.modal_id && (
                        <p className="text-[11px] text-red-400 mt-0.5">{errorRow.message}</p>
                      )}
                      {savedId === m.modal_id && !errorRow && (
                        <p className="text-[11px] text-emerald-400 mt-0.5">{fleetCopy.saved}</p>
                      )}
                    </div>
                    <button
                      onClick={() => modalToggleMut.mutate({ modalId: m.modal_id, is_active: !ligado })}
                      disabled={salvando}
                      className={`shrink-0 text-[11.5px] font-bold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                        ligado
                          ? 'bg-brand/15 border-brand/60 text-brand'
                          : 'border-gray-700 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {ligado ? 'Opera' : 'Não opera'}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Perfil de COMBO — pedido que junta meios diferentes (buggy +
                barco). Ele vai INTEIRO para um operador só, então só faz
                sentido para quem opera mais de um meio. */}
            <div className="mt-3 pt-3 border-t border-gray-800">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200">Aceita pedidos combinados</p>
                  <p className="text-[11px] text-gray-500">
                    {meiosOperados > 1
                      ? 'Pedido que junta meios diferentes (ex.: buggy + barco) vai inteiro para este operador.'
                      : 'Só vale para quem opera mais de um meio — marque os meios acima primeiro.'}
                  </p>
                  {errorRow?.id === 'combo' && (
                    <p className="text-[11px] text-red-400 mt-0.5">{errorRow.message}</p>
                  )}
                </div>
                <button
                  onClick={() => comboMut.mutate(!aceitaCombo)}
                  disabled={comboMut.isPending}
                  className={`shrink-0 text-[11.5px] font-bold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                    aceitaCombo
                      ? 'bg-brand/15 border-brand/60 text-brand'
                      : 'border-gray-700 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {aceitaCombo ? 'Aceita' : 'Não aceita'}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-2">
                {meiosOperados > 1 && aceitaCombo
                  ? 'Perfil: universal — recebe os serviços de cada meio e os combos entre eles.'
                  : meiosOperados <= 1
                    ? 'Perfil: categoria única — recebe só os serviços do meio que opera.'
                    : 'Perfil: recebe os serviços de cada meio, mas não os combos.'}
              </p>
            </div>
          </div>
        )}

        {/* Ajuste fino DENTRO do meio já liberado: a coop que faz terrestre mas
            não tem jardineira. Quem opera só por categoria nunca precisa abrir. */}
        <button
          type="button"
          onClick={() => setMostrarVeiculos((v) => !v)}
          className="w-full flex items-center justify-between text-left px-3 py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <span className="text-xs font-semibold">
            Ajuste fino por veículo (opcional) · {releasedCount} de {vehicles.length} liberados
          </span>
          <span className="text-xs">{mostrarVeiculos ? 'Ocultar' : 'Mostrar'}</span>
        </button>

        {mostrarVeiculos && vehicles.length > 8 && (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={fleetCopy.search}
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand"
            />
          </div>
        )}

        {mostrarVeiculos && (isLoading ? (
          <p className="text-sm text-gray-500 py-8 text-center">{fleetCopy.loading}</p>
        ) : isError ? (
          <div className="text-center py-8">
            <AlertCircle size={20} className="mx-auto text-red-400 mb-2" />
            <p className="text-sm text-red-400">{fleetCopy.loadError}</p>
            <button onClick={() => refetch()} className="mt-2 text-xs font-semibold text-brand hover:underline">
              {fleetCopy.retry}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">{fleetCopy.empty}</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-800">
            {filtered.map((v) => {
              const pending    = toggleMut.isPending && toggleMut.variables?.vehicleId === v.vehicle_id
              const isReleased = v.is_active !== false
              return (
                <div key={v.vehicle_id} className="flex items-center gap-3 py-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center overflow-hidden shrink-0">
                    {v.image_url
                      ? <img src={v.image_url} alt={v.name} className="w-full h-full object-cover" />
                      : <Car size={18} className="text-gray-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{v.name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span>{VEHICLE_TYPE_LABEL[v.vehicle_type] || v.vehicle_type}</span>
                      <span>·</span>
                      <Users size={10} />
                      <span>{v.seat_capacity} pax</span>
                    </div>
                    {errorRow?.id === v.vehicle_id && (
                      <p className="text-[11px] text-red-400 mt-0.5">{errorRow.message}</p>
                    )}
                    {savedId === v.vehicle_id && (
                      <p className="text-[11px] text-green-400 mt-0.5">{fleetCopy.saved}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-pressed={isReleased}
                    disabled={pending}
                    onClick={() => toggleMut.mutate({ vehicleId: v.vehicle_id, is_active: !isReleased })}
                    title={isReleased ? fleetCopy.notRelease : fleetCopy.release}
                    className="shrink-0 disabled:opacity-50"
                  >
                    {isReleased
                      ? <ToggleRight size={26} className="text-brand" />
                      : <ToggleLeft size={26} className="text-gray-600" />}
                  </button>
                </div>
              )
            })}
          </div>
        ))}

        {/* Rodapé — contador vivo */}
        {!isLoading && !isError && vehicles.length > 0 && (
          <div className="pt-2 border-t border-gray-700 text-xs text-gray-500 text-center">
            {fleetCopy.summary(releasedCount, vehicles.length)}
          </div>
        )}
      </div>
    </Modal>
  )
}
