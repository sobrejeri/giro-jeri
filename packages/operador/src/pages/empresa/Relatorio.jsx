// Relatório da empresa: vendas e repasses por operador e por executor, num
// período escolhido, com download em Excel e PDF.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { api } from '../../lib/api'
import { montarRelatorio, abasDoRelatorio } from '../../lib/relatorioEmpresa'
import { baixarXlsx } from '../../lib/xlsx'
import Card, { CardBody } from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// Atalhos de período, a partir de "hoje" em Fortaleza.
export function atalhos(hojeIso) {
  const [y, m, d] = hojeIso.split('-').map(Number)
  const hoje = new Date(y, m - 1, d)
  return {
    'Este mês':        { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    'Mês passado':     { from: iso(new Date(y, m - 2, 1)), to: iso(new Date(y, m - 1, 0)) },
    'Últimos 7 dias':  { from: iso(new Date(y, m - 1, d - 6)), to: iso(hoje) },
    'Últimos 30 dias': { from: iso(new Date(y, m - 1, d - 29)), to: iso(hoje) },
  }
}
const hojeFortaleza = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date())

function Numero({ rotulo, valor, detalhe, cor = 'text-gray-900' }) {
  return (
    <Card><CardBody className="!py-3">
      <p className="text-xs text-gray-500">{rotulo}</p>
      <p className={`text-lg font-bold leading-tight ${cor}`}>{valor}</p>
      {detalhe && <p className="text-xs text-gray-500 mt-0.5">{detalhe}</p>}
    </CardBody></Card>
  )
}
const Td = ({ children, d }) => <td className={`px-3 py-2 whitespace-nowrap ${d ? 'text-right tabular-nums' : ''}`}>{children}</td>
const Th = ({ children, d }) => <th className={`px-3 py-2 text-xs font-semibold text-gray-500 whitespace-nowrap ${d ? 'text-right' : 'text-left'}`}>{children}</th>

export default function Relatorio({ empresa }) {
  const A = useMemo(() => atalhos(hojeFortaleza()), [])
  const [periodo, setPeriodo] = useState(A['Este mês'])
  const [baixando, setBaixando] = useState('')
  const [erro, setErro] = useState('')
  const valido = !!periodo.from && !!periodo.to && periodo.from <= periodo.to

  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: ['company-report', periodo.from, periodo.to],
    enabled: valido,
    queryFn: async () => {
      const [desempenho, executores, vendedores] = await Promise.all([
        api.getCompanyBookings(periodo), api.getCompanyExecutorPayouts(periodo), api.getCompanySellerPayouts(periodo),
      ])
      return { pendente: !!desempenho?.pendente, rel: montarRelatorio({ desempenho, executores, vendedores }) }
    },
    placeholderData: (prev) => prev,
  })
  const rel = data?.rel
  const t = rel?.totais
  const vazio = rel && rel.operadores.length === 0 && rel.executores.length === 0
  const arquivo = `relatorio-${periodo.from}_a_${periodo.to}`

  async function baixar(tipo) {
    setErro(''); setBaixando(tipo)
    try {
      if (tipo === 'excel') baixarXlsx(arquivo, abasDoRelatorio(rel, { empresa, ...periodo }))
      else {
        const { montarRelatorioPDF } = await import('../../lib/relatorioPDF')   // jsPDF só carrega ao pedir o PDF
        montarRelatorioPDF(rel, { empresa, ...periodo }).save(`${arquivo}.pdf`)
      }
    } catch (e) { setErro('Não foi possível gerar o arquivo. Tente de novo.') } finally { setBaixando('') }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Relatório</h2>
        <p className="text-sm text-gray-600">Vendas e repasses por operador e por executor no período, pela data do serviço.</p>
      </div>

      <Card><CardBody className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Data inicial" type="date" value={periodo.from} max={periodo.to} onChange={(e) => setPeriodo({ ...periodo, from: e.target.value })} />
          <Input label="Data final" type="date" value={periodo.to} min={periodo.from} onChange={(e) => setPeriodo({ ...periodo, to: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos de período">
          {Object.entries(A).map(([rotulo, p]) => {
            const ativo = p.from === periodo.from && p.to === periodo.to
            return (
              <button key={rotulo} aria-pressed={ativo} onClick={() => setPeriodo(p)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${ativo ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {rotulo}
              </button>
            )
          })}
        </div>
        {!valido && <p role="alert" className="text-sm text-red-700">A data inicial precisa ser anterior à final.</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => baixar('excel')} disabled={!rel || vazio || !!baixando || isFetching}><FileSpreadsheet size={16} /> {baixando === 'excel' ? 'Gerando…' : 'Baixar Excel'}</Button>
          <Button variant="secondary" onClick={() => baixar('pdf')} disabled={!rel || vazio || !!baixando || isFetching}><FileText size={16} /> {baixando === 'pdf' ? 'Gerando…' : 'Baixar PDF'}</Button>
        </div>
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </CardBody></Card>

      {isPending && valido && <p className="text-sm text-gray-600">Calculando…</p>}
      {isError && <p role="alert" className="text-sm text-red-700">Não foi possível carregar o relatório.</p>}
      {data?.pendente && <Card><CardBody><p className="text-sm text-gray-700">O relatório ainda não está disponível para a sua empresa. Avise a Turiva.</p></CardBody></Card>}
      {vazio && !data.pendente && <Card><CardBody className="text-center py-8"><p className="font-medium text-gray-900">Nada neste período</p><p className="text-sm text-gray-600 mt-1">Escolha outras datas.</p></CardBody></Card>}

      {rel && !vazio && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Numero rotulo="Total vendido" valor={moeda(t.vendido_total)} detalhe={`${t.reservas} na plataforma · ${t.externas} por fora`} />
            <Numero rotulo="Comissão da plataforma" valor={moeda(t.comissao_plataforma)} detalhe="recebida pela empresa" />
            <Numero rotulo="Já pago à equipe" valor={moeda(t.ja_pago)} cor="text-green-600" detalhe="operadores + executores" />
            <Numero rotulo="A pagar à equipe" valor={moeda(t.a_pagar)} cor="text-amber-600" detalhe={t.sem_valor ? `+ ${t.sem_valor} serviço(s) sem valor` : 'operadores + executores'} />
          </div>

          <Card aria-label="Por operador"><CardBody className="!px-0">
            <h3 className="font-semibold text-gray-900 text-sm px-5">Por operador — vendas e comissão</h3>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm">
                <thead><tr className="border-y border-gray-100 bg-gray-50"><Th>Operador</Th><Th d>Vendas</Th><Th d>Total vendido</Th><Th d>Comissão</Th><Th d>Paga</Th><Th d>A pagar</Th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rel.operadores.map((o) => (
                    <tr key={o.operator_id}><Td><span className="font-medium text-gray-900">{o.nome}</span></Td><Td d>{o.reservas + o.externas}</Td><Td d>{moeda(o.vendido_total)}</Td><Td d>{moeda(o.comissao_devida)}</Td><Td d>{moeda(o.comissao_paga)}</Td><Td d><span className={o.comissao_pendente > 0 ? 'font-semibold text-amber-700' : ''}>{moeda(o.comissao_pendente)}</span></Td></tr>
                  ))}
                  {rel.operadores.length === 0 && <tr><td colSpan={6} className="px-5 py-3 text-gray-500">Nenhuma venda no período.</td></tr>}
                </tbody>
                {rel.operadores.length > 0 && <tfoot><tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900"><Td>Total</Td><Td d>{t.reservas + t.externas}</Td><Td d>{moeda(t.vendido_total)}</Td><Td d>{moeda(t.comissao_devida)}</Td><Td d>{moeda(t.comissao_paga)}</Td><Td d>{moeda(t.comissao_pendente)}</Td></tr></tfoot>}
              </table>
            </div>
          </CardBody></Card>

          <Card aria-label="Por executor"><CardBody className="!px-0">
            <h3 className="font-semibold text-gray-900 text-sm px-5">Por executor — serviços e repasse</h3>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm">
                <thead><tr className="border-y border-gray-100 bg-gray-50"><Th>Executor</Th><Th d>Serviços</Th><Th d>Repasse</Th><Th d>Pago</Th><Th d>A pagar</Th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rel.executores.map((e) => (
                    <tr key={`${e.nome}|${e.papel}`}><Td><span className="font-medium text-gray-900">{e.nome}</span><span className="block text-xs text-gray-500">{e.papel}{e.sem_valor ? ` · ${e.sem_valor} sem valor` : ''}</span></Td><Td d>{e.servicos}</Td><Td d>{moeda(e.repasse_devido)}</Td><Td d>{moeda(e.repasse_pago)}</Td><Td d><span className={e.repasse_pendente > 0 ? 'font-semibold text-amber-700' : ''}>{moeda(e.repasse_pendente)}</span></Td></tr>
                  ))}
                  {rel.executores.length === 0 && <tr><td colSpan={5} className="px-5 py-3 text-gray-500">Nenhum despacho com executor no período.</td></tr>}
                </tbody>
                {rel.executores.length > 0 && <tfoot><tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900"><Td>Total</Td><Td d>{t.servicos}</Td><Td d>{moeda(t.repasse_devido)}</Td><Td d>{moeda(t.repasse_pago)}</Td><Td d>{moeda(t.repasse_pendente)}</Td></tr></tfoot>}
              </table>
            </div>
          </CardBody></Card>
          <p className="text-xs text-gray-500">O Excel traz também as abas "Vendas" e "Repasses", com cada lançamento do período.</p>
        </>
      )}
    </div>
  )
}
