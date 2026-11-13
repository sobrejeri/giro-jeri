// Equipe da empresa: criar, editar, bloquear e remover operadores.
// Remover NÃO apaga — o acesso é bloqueado e o histórico (reservas e
// comissões) continua com a empresa.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Pencil, Lock, Unlock, KeyRound, UserMinus, MapPin } from 'lucide-react'
import { api } from '../../lib/api'
import Card, { CardBody } from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'

const soDigitos = (v) => String(v || '').replace(/\D/g, '')
export function formatarDocumento(v) {
  const d = soDigitos(v)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return v || ''
}
const NOVO = { full_name: '', document: '', email: '', phone: '', password: '', region_ids: [] }

function Municipios({ regions, value, onChange }) {
  if (!regions.length) return null
  const alternar = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-700">Municípios que atende</legend>
      <p className="text-xs text-gray-500 mt-0.5">O operador só recebe solicitações dos municípios marcados.</p>
      <div className="flex flex-wrap gap-2 mt-2">
        {regions.map((r) => {
          const ligado = value.includes(r.id)
          return (
            <button type="button" key={r.id} aria-pressed={ligado} onClick={() => alternar(r.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${ligado
                ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {r.name}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function Equipe() {
  const qc = useQueryClient()
  const { data, isPending, isError } = useQuery({ queryKey: ['company-team'], queryFn: api.getCompanyTeam })
  const { data: regions = [] } = useQuery({ queryKey: ['regions'], queryFn: api.getRegions, staleTime: 5 * 60 * 1000 })
  const [modal, setModal] = useState(null)     // { modo: 'novo' | 'editar' | 'senha' | 'remover', op? }
  const [form, setForm] = useState(NOVO)
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [verRemovidos, setVerRemovidos] = useState(false)

  const equipe = data?.team || []
  const removidos = data?.removed || []
  const nomeMunicipio = (id) => regions.find((r) => r.id === id)?.name

  const abrir = (modo, op = null) => {
    setErro(''); setSenha('')
    setForm(op ? { full_name: op.full_name || '', email: op.email || '', phone: op.phone || '', region_ids: op.region_ids || [] } : NOVO)
    setModal({ modo, op })
  }
  const fechar = () => { if (!busy) setModal(null) }

  // Roda a ação, recarrega a equipe e mostra o resultado.
  async function executar(acao, mensagem) {
    setBusy(true); setErro('')
    try {
      await acao()
      await qc.invalidateQueries({ queryKey: ['company-team'] })
      setModal(null); setAviso(mensagem)
    } catch (e) { setErro(e.message || 'Não foi possível concluir.') } finally { setBusy(false) }
  }

  const salvar = (e) => {
    e.preventDefault()
    if (modal.modo === 'novo') {
      return executar(() => api.createCompanyOperator({
        full_name: form.full_name.trim(), document: form.document.trim(), email: form.email.trim(),
        password: form.password, region_ids: form.region_ids,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      }), 'Operador criado. Ele já pode entrar com o CPF/CNPJ e a senha definida.')
    }
    return executar(() => api.updateCompanyOperator(modal.op.id, {
      full_name: form.full_name.trim(), email: form.email.trim(),
      phone: form.phone.trim() || null, region_ids: form.region_ids,
    }), 'Dados do operador atualizados.')
  }
  const alternarBloqueio = (op) => executar(
    () => api.updateCompanyOperator(op.id, { is_active: !op.is_active }),
    op.is_active ? `${op.full_name} foi bloqueado e não consegue mais entrar.` : `${op.full_name} foi desbloqueado.`)

  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Equipe</h2>
          <p className="text-sm text-gray-600">Operadores que vendem e atendem pela empresa.</p>
        </div>
        <Button onClick={() => abrir('novo')} className="shrink-0"><UserPlus size={16} /> Novo operador</Button>
      </div>

      {aviso && <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-100 rounded-lg px-3 py-2">{aviso}</p>}
      {erro && !modal && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}
      {isError && <p role="alert" className="text-sm text-red-700">Não foi possível carregar a equipe.</p>}
      {isPending && <p className="text-sm text-gray-600">Carregando equipe…</p>}

      {data?.pendente && (
        <Card><CardBody><p className="text-sm text-gray-700">A equipe ainda não está disponível para a sua empresa. Avise a Turiva.</p></CardBody></Card>
      )}
      {data && !data.pendente && equipe.length === 0 && (
        <Card><CardBody className="text-center py-8">
          <p className="font-medium text-gray-900">Nenhum operador na equipe</p>
          <p className="text-sm text-gray-600 mt-1">Crie o primeiro operador para ele começar a receber solicitações pela empresa.</p>
        </CardBody></Card>
      )}

      <ul className="space-y-3">
        {equipe.map((op) => (
          <li key={op.id}>
            <Card><CardBody>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{op.full_name}</p>
                  <p className="text-sm text-gray-600">{formatarDocumento(op.document_number)}</p>
                  <p className="text-sm text-gray-500 truncate">{[op.email, op.phone].filter(Boolean).join(' · ')}</p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${op.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {op.is_active ? 'Ativo' : 'Bloqueado'}
                </span>
              </div>
              <p className="flex items-start gap-1.5 text-xs text-gray-500 mt-2">
                <MapPin size={13} className="mt-0.5 shrink-0" />
                {op.region_ids.length
                  ? op.region_ids.map(nomeMunicipio).filter(Boolean).join(', ') || `${op.region_ids.length} município(s)`
                  : <span className="text-amber-700">Sem município — não recebe solicitações</span>}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button variant="secondary" size="sm" onClick={() => abrir('editar', op)}><Pencil size={14} /> Editar</Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => alternarBloqueio(op)}>
                  {op.is_active ? <><Lock size={14} /> Bloquear</> : <><Unlock size={14} /> Desbloquear</>}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => abrir('senha', op)}><KeyRound size={14} /> Senha</Button>
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => abrir('remover', op)}><UserMinus size={14} /> Remover</Button>
              </div>
            </CardBody></Card>
          </li>
        ))}
      </ul>

      {removidos.length > 0 && (
        <div>
          <button className="text-sm text-gray-600 underline" aria-expanded={verRemovidos} onClick={() => setVerRemovidos(!verRemovidos)}>
            {verRemovidos ? 'Ocultar' : 'Ver'} removidos da equipe ({removidos.length})
          </button>
          {verRemovidos && (
            <ul className="mt-2 divide-y divide-gray-100 bg-white border border-gray-100 rounded-xl">
              {removidos.map((op) => (
                <li key={op.id} className="px-4 py-3 text-sm flex justify-between gap-3">
                  <span className="text-gray-700 truncate">{op.full_name} · {formatarDocumento(op.document_number)}</span>
                  <span className="text-gray-500 shrink-0">removido em {new Date(op.removed_at).toLocaleDateString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal open={modal?.modo === 'novo' || modal?.modo === 'editar'} onClose={fechar} title={modal?.modo === 'novo' ? 'Novo operador' : 'Editar operador'}>
        <form onSubmit={salvar} className="space-y-3">
          <Input label="Nome completo" required minLength={2} {...campo('full_name')} />
          {modal?.modo === 'novo'
            ? <Input label="CPF ou CNPJ (é o login do operador)" required inputMode="numeric" placeholder="Somente números" {...campo('document')} />
            : <Input label="CPF ou CNPJ (login)" disabled value={formatarDocumento(modal?.op?.document_number)} readOnly />}
          <Input label="E-mail" type="email" required {...campo('email')} />
          <Input label="Telefone / WhatsApp" inputMode="tel" placeholder="(88) 90000-0000" {...campo('phone')} />
          {modal?.modo === 'novo' && <Input label="Senha de acesso" type="text" required minLength={6} placeholder="Mínimo 6 caracteres" autoComplete="off" {...campo('password')} />}
          <Municipios regions={regions} value={form.region_ids} onChange={(region_ids) => setForm({ ...form, region_ids })} />
          {modal?.modo === 'novo' && <p className="text-xs text-gray-500">As comissões deste operador são pagas à empresa, na conta cadastrada em "Conta".</p>}
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={fechar}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : modal?.modo === 'novo' ? 'Criar operador' : 'Salvar'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal?.modo === 'senha'} onClose={fechar} title="Nova senha" size="sm">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); executar(() => api.setCompanyOperatorPassword(modal.op.id, senha), `Senha de ${modal.op.full_name} alterada.`) }}>
          <p className="text-sm text-gray-600">Defina uma nova senha para <strong>{modal?.op?.full_name}</strong> e informe a ele.</p>
          <Input label="Nova senha" type="text" required minLength={6} autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} />
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={fechar}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Trocar senha'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal?.modo === 'remover'} onClose={fechar} title="Remover da equipe" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Remover <strong>{modal?.op?.full_name}</strong> da equipe?</p>
          <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
            <li>Ele perde o acesso na hora.</li>
            <li>As reservas e comissões dele continuam no histórico da empresa.</li>
            <li>Para devolver o acesso depois, fale com a Turiva.</li>
          </ul>
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={fechar}>Cancelar</Button>
            <Button variant="danger" disabled={busy} onClick={() => executar(() => api.removeCompanyOperator(modal.op.id), `${modal.op.full_name} foi removido da equipe.`)}>
              {busy ? 'Removendo…' : 'Remover'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
