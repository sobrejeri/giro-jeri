// Repasses a quem executou: a empresa acompanha os despachos da equipe e
// registra o que pagou a motoristas, guias e tripulações. O pagamento é feito
// por fora (PIX/dinheiro) — aqui fica o controle.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Undo2, Copy, Phone, Ban } from 'lucide-react'
import { api } from '../../lib/api'
import Card, { CardBody } from '../../components/ui/Card'
import Input, { Textarea } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { papelExecutor } from '../../lib/papelExecutor'

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = (d) => { const [y, m, x] = String(d || '').slice(0, 10).split('-'); return y && m && x ? `${x}/${m}/${y}` : '—' }
const lerValor = (t) => { const s = String(t).trim(); return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) }
const FILTROS = [['pending', 'A pagar'], ['paid', 'Pagos'], ['cancelled', 'Cancelados'], ['all', 'Todos']]
const SITUACAO = {
  pending:   ['A pagar',   'bg-amber-100 text-amber-700'],
  paid:      ['Pago',      'bg-green-100 text-green-700'],
  cancelled: ['Cancelado', 'bg-gray-100 text-gray-500'],
}

// Os dois repasses que a empresa paga por fora, com a mesma mecânica de baixa.
const TIPOS = {
  executor: {
    rotulo: 'Quem executou', chave: 'company-executor-payouts',
    listar: (p) => api.getCompanyExecutorPayouts(p), salvar: (id, b) => api.updateCompanyExecutorPayout(id, b),
    texto: 'Motoristas, guias e tripulações dos despachos da equipe.',
    vazio: 'Os repasses aparecem quando um operador da equipe despacha uma reserva informando quem vai executar.',
    rotuloValor: 'Valor combinado (R$)', erroValor: 'Informe o valor combinado com quem executou.',
  },
  vendedor: {
    rotulo: 'Quem vendeu', chave: 'company-seller-payouts',
    listar: (p) => api.getCompanySellerPayouts(p), salvar: (id, b) => api.updateCompanySellerPayout(id, b),
    texto: 'Comissão dos operadores da equipe sobre as reservas que venderam, pelo percentual definido no cadastro de cada um.',
    vazio: 'A comissão aparece quando uma reserva vendida por um operador com percentual definido é paga pelo cliente.',
    rotuloValor: 'Valor da comissão (R$)', erroValor: 'Informe o valor da comissão.',
  },
}
const CHAVE_TIPO = 'empresa_repasses_tipo'
const tipoSalvo = () => { try { return sessionStorage.getItem(CHAVE_TIPO) } catch { return null } }

export default function Repasses() {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState(() => (TIPOS[tipoSalvo()] ? tipoSalvo() : 'executor'))
  const T = TIPOS[tipo]
  const [status, setStatus] = useState('pending')
  const { data, isPending, isError } = useQuery({
    queryKey: [T.chave, status],
    queryFn: () => T.listar(status === 'all' ? {} : { status }),
    // Ao trocar de tipo não reaproveita a lista do outro.
    placeholderData: (prev, q) => (q?.queryKey[0] === T.chave ? prev : undefined),
  })
  const trocarTipo = (t) => { setTipo(t); setErro(''); try { sessionStorage.setItem(CHAVE_TIPO, t) } catch { /* sem armazenamento */ } }
  const [modal, setModal] = useState(null)        // { r, baixa: bool }
  const [valor, setValor] = useState('')
  const [obs, setObs] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(null)
  const rows = data?.rows || []
  const totals = data?.totals

  const abrir = (r, baixa) => {
    setErro(''); setValor(r.driver_payout_amount != null ? String(r.driver_payout_amount).replace('.', ',') : ''); setObs(r.driver_payout_notes || '')
    setModal({ r, baixa })
  }
  async function executar(id, body) {
    setBusy(true); setErro('')
    try {
      await T.salvar(id, body)
      await qc.invalidateQueries({ queryKey: [T.chave] })
      setModal(null)
    } catch (e) { setErro(e.message || 'Não foi possível salvar.') } finally { setBusy(false) }
  }
  const salvar = (e) => {
    e.preventDefault()
    const v = lerValor(valor)
    if (!Number.isFinite(v) || v < 0 || (modal.baixa && !(v > 0))) return setErro(T.erroValor)
    return executar(modal.r.id, { amount: v, notes: obs, ...(modal.baixa ? { status: 'paid' } : {}) })
  }
  const copiar = async (r) => {
    try { await navigator.clipboard.writeText(r.pix_key); setCopiado(r.id); setTimeout(() => setCopiado(null), 1500) } catch { /* sem permissão */ }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Repasses</h2>
        <p className="text-sm text-gray-600">O que a empresa paga à equipe. O pagamento é feito por você, fora da plataforma — aqui fica o controle.</p>
      </div>

      <div className="grid grid-cols-2 gap-1 bg-gray-100 p-1 rounded-xl" role="group" aria-label="Tipo de repasse">
        {Object.entries(TIPOS).map(([id, t]) => (
          <button key={id} aria-pressed={tipo === id} onClick={() => trocarTipo(id)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${tipo === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.rotulo}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-600">{T.texto}</p>

      {totals && !data.pendente && (
        <div className="grid grid-cols-2 gap-3">
          <Card><CardBody className="!py-3">
            <p className="text-xs text-gray-500">A pagar</p>
            <p className="text-lg font-bold text-amber-600">{moeda(totals.pending)}</p>
            {totals.sem_valor > 0 && <p className="text-xs text-gray-500">+ {totals.sem_valor} sem valor definido</p>}
          </CardBody></Card>
          <Card><CardBody className="!py-3">
            <p className="text-xs text-gray-500">Já pago</p>
            <p className="text-lg font-bold text-green-600">{moeda(totals.paid)}</p>
          </CardBody></Card>
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto scrollbar-hide" role="group" aria-label="Filtrar por situação">
        {FILTROS.map(([id, rotulo]) => (
          <button key={id} aria-pressed={status === id} onClick={() => setStatus(id)}
            className={`flex-1 shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${status === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {rotulo}
          </button>
        ))}
      </div>

      {isPending && <p className="text-sm text-gray-600">Carregando…</p>}
      {isError && <p role="alert" className="text-sm text-red-700">Não foi possível carregar os repasses.</p>}
      {erro && !modal && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}
      {data?.pendente && <Card><CardBody><p className="text-sm text-gray-700">Os repasses ainda não estão disponíveis para a sua empresa. Avise a Turiva.</p></CardBody></Card>}
      {data && !data.pendente && rows.length === 0 && (
        <Card><CardBody className="text-center py-8">
          <p className="font-medium text-gray-900">Nada por aqui</p>
          <p className="text-sm text-gray-600 mt-1">{data.sem_percentual ? 'Nenhum operador da equipe tem percentual de comissão. Defina em Equipe › Editar.' : T.vazio}</p>
        </CardBody></Card>
      )}

      <ul className="space-y-3">
        {rows.map((r) => {
          const [rotulo, cor] = SITUACAO[r.driver_payout_status] || SITUACAO.pending
          const concluida = r.status_operational === 'completed'
          const semValor = r.driver_payout_amount == null
          return (
            <li key={r.id}><Card><CardBody>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{r.executor}</p>
                  <p className="text-sm text-gray-600 truncate">{r.executor_role === 'seller' ? 'Operador que vendeu' : [papelExecutor(r.executor_role).nome, r.veiculo, r.executor_phone].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-semibold ${semValor ? 'text-gray-400' : 'text-gray-900'}`}>{semValor ? 'Sem valor' : moeda(r.driver_payout_amount)}</p>
                  <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{rotulo}</span>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-sm">
                <div className="min-w-0"><dt className="text-xs text-gray-500">Serviço</dt><dd className="text-gray-800">{r.booking_code}<span className="block text-xs text-gray-500">{dia(r.service_date)}</span></dd></div>
                {r.executor_role === 'seller'
                  ? <div className="min-w-0"><dt className="text-xs text-gray-500">Cálculo</dt><dd className="text-gray-800">{String(r.pct).replace('.', ',')}% de {moeda(r.base_amount)}</dd></div>
                  : <div className="min-w-0"><dt className="text-xs text-gray-500">Despachado por</dt><dd className="text-gray-800 truncate">{r.operador}</dd></div>}
              </dl>
              {r.trajeto && <p className="text-xs text-gray-500 mt-1 truncate">{r.trajeto}</p>}
              {r.driver_payout_status === 'paid' && r.driver_paid_at && <p className="text-xs text-gray-500 mt-1">Pago em {dia(r.driver_paid_at)}{r.driver_payout_notes ? ` · ${r.driver_payout_notes}` : ''}</p>}
              {r.driver_payout_status === 'pending' && !concluida && <p className="text-xs text-amber-700 mt-1">Serviço ainda não concluído — a baixa libera depois da conclusão.</p>}

              <div className="flex flex-wrap gap-2 mt-3">
                {r.driver_payout_status === 'pending' && <>
                  <Button size="sm" disabled={!concluida} onClick={() => abrir(r, true)}><Check size={14} /> Dar baixa</Button>
                  <Button variant="secondary" size="sm" onClick={() => abrir(r, false)}>{semValor ? 'Definir valor' : 'Alterar valor'}</Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => executar(r.id, { status: 'cancelled' })}><Ban size={14} /> Não é devido</Button>
                </>}
                {r.driver_payout_status !== 'pending' && (
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => executar(r.id, { status: 'pending' })}><Undo2 size={14} /> {r.driver_payout_status === 'paid' ? 'Desfazer baixa' : 'Reabrir'}</Button>
                )}
                {r.pix_key && r.driver_payout_status === 'pending' && (
                  <Button variant="ghost" size="sm" onClick={() => copiar(r)}><Copy size={14} /> {copiado === r.id ? 'Copiado!' : 'Copiar PIX'}</Button>
                )}
                {r.executor_phone && <a className="inline-flex items-center gap-1.5 h-8 px-3 text-sm text-gray-600 hover:text-gray-900" href={`tel:${r.executor_phone.replace(/[^\d+]/g, '')}`}><Phone size={14} /> Ligar</a>}
              </div>
            </CardBody></Card></li>
          )
        })}
      </ul>

      <Modal open={!!modal} onClose={() => !busy && setModal(null)} title={modal?.baixa ? 'Dar baixa no repasse' : 'Valor do repasse'} size="sm">
        <form onSubmit={salvar} className="space-y-3">
          <p className="text-sm text-gray-600"><strong>{modal?.r.executor}</strong> · {modal?.r.booking_code} · {dia(modal?.r.service_date)}</p>
          {modal?.baixa && modal?.r.pix_key && <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 break-all">PIX: {modal.r.pix_key}</p>}
          <Input label={T.rotuloValor} required inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
          <Textarea label="Observação" rows={2} maxLength={1000} placeholder="Ex.: PIX feito em 13/11" value={obs} onChange={(e) => setObs(e.target.value)} />
          {modal?.baixa && <p className="text-xs text-gray-500">A baixa só registra que você já pagou. Nenhum dinheiro é movimentado pela plataforma.</p>}
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>Voltar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : modal?.baixa ? 'Confirmar que paguei' : 'Salvar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
