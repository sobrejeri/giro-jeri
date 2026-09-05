import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Wallet, Clock, CheckCircle2, Compass, Car } from 'lucide-react'
import { api } from '../lib/api'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

// ── Meus recebimentos ────────────────────────────────────────────────────────
// O que ESTE operador ganha, e só isso.
//
// O "Detalhamento" ao lado é o razão da PLATAFORMA visto por ele: Receita
// Bruta, Comissão plataforma, Receita Líquida. Nenhuma dessas linhas responde
// "quanto eu ganhei" — a Receita Líquida de lá é o que sobra para a plataforma
// depois da taxa do gateway, não o que cai para o operador. Aqui é a conta
// dele: os repasses, um por reserva, com o que já foi pago e o que falta.

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const hoje       = () => new Date()
const iso        = (d) => d.toISOString().slice(0, 10)
const maisDias   = (n) => { const d = hoje(); d.setDate(d.getDate() + n); return iso(d) }
const inicioMes  = () => { const d = hoje(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)) }
const inicioAno  = () => { const d = hoje(); return iso(new Date(d.getFullYear(), 0, 1)) }

// Períodos ancorados em HOJE. "Tudo" primeiro de propósito: com o histórico
// ainda curto, filtrar por mês esconderia quase tudo e a tela pareceria vazia.
const PERIODOS = [
  { id: 'tudo',   label: 'Tudo',        range: () => ['', ''] },
  { id: 'mes',    label: 'Este mês',    range: () => [inicioMes(), iso(hoje())] },
  { id: 'ult30',  label: 'Últimos 30',  range: () => [maisDias(-30), iso(hoje())] },
  { id: 'prox30', label: 'Próximos 30', range: () => [iso(hoje()), maisDias(30)] },
  { id: 'ano',    label: 'Este ano',    range: () => [inicioAno(), iso(hoje())] },
]

const KIND_LABEL = {
  commission: 'Por aceitar',
  execution:  'Por executar',
}

function Resumo({ icon: Icon, label, value, cor, fundo }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${fundo}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] text-gray-400 font-medium">{label}</p>
        <p className={`text-[20px] font-black leading-tight ${cor}`}>{value}</p>
      </div>
    </div>
  )
}

export default function MeusRecebimentos() {
  const [periodo, setPeriodo] = useState('tudo')
  const [de,  setDe]  = useState('')
  const [ate, setAte] = useState('')

  function aplicar(p) {
    const [d, a] = p.range()
    setDe(d); setAte(a); setPeriodo(p.id)
  }

  const params = useMemo(() => {
    const o = {}
    if (de)  o.from = de
    if (ate) o.to   = ate
    return o
  }, [de, ate])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['meus-recebimentos', params],
    queryFn:  () => api.getMeusRecebimentos(params),
  })

  const itens = data?.itens || []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-brand" />
          <h2 className="text-sm font-semibold text-gray-700">Meus recebimentos</h2>
        </div>
      </CardHeader>
      <CardBody>
        {/* Período */}
        <div className="flex flex-wrap gap-2 mb-4">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              onClick={() => aplicar(p)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
                periodo === p.id
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Datas exatas — para quem precisa fechar um acerto de um intervalo
            específico, que os atalhos não cobrem. */}
        <div className="flex flex-wrap items-center gap-2 mb-5 text-[12px] text-gray-500">
          <span>De</span>
          <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPeriodo('') }}
            className="border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-brand/60" />
          <span>até</span>
          <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo('') }}
            className="border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-brand/60" />
        </div>

        {/* Totais */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <Resumo icon={Clock}        label="A receber"       value={fmt(data?.a_receber)} cor="text-amber-600"  fundo="bg-amber-500" />
          <Resumo icon={CheckCircle2} label="Já recebido"     value={fmt(data?.recebido)}  cor="text-green-600"  fundo="bg-green-500" />
          <Resumo icon={Wallet}       label="Total no período" value={fmt(data?.total)}     cor="text-gray-900"   fundo="bg-gray-800"  />
        </div>

        {data?.aviso && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
            <p className="text-[13px] text-amber-800">{data.aviso}</p>
          </div>
        )}

        {isLoading ? (
          <p className="text-[13px] text-gray-400 py-4">Carregando…</p>
        ) : isError ? (
          <p className="text-[13px] text-gray-400 py-4">
            Não foi possível carregar seus recebimentos agora. Tente de novo em instantes.
          </p>
        ) : itens.length === 0 ? (
          <p className="text-[13px] text-gray-400 bg-gray-50 rounded-xl px-4 py-4">
            Nenhum recebimento neste período. Os valores aparecem aqui depois que
            a reserva é paga.
          </p>
        ) : (
          <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
            {itens.map((i) => {
              const Icone = i.service_type === 'transfer' ? Car : Compass
              let quando = '—'
              if (i.service_date) {
                try { quando = format(parseISO(i.service_date), "d 'de' MMM", { locale: ptBR }) } catch { /* data ruim não quebra a linha */ }
              }
              return (
                <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                    <Icone size={16} className="text-gray-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">
                      {i.service_name || (i.service_type === 'transfer' ? 'Translado' : 'Passeio')}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {quando}
                      {i.service_time ? ` · ${i.service_time.slice(0, 5)}` : ''}
                      {i.booking_code ? ` · ${i.booking_code}` : ''}
                      {' · '}{KIND_LABEL[i.kind] || i.kind}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[14px] font-bold text-gray-900 leading-none">{fmt(i.amount)}</p>
                    <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      i.status === 'paid'
                        ? 'bg-green-50 text-green-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}>
                      {i.status === 'paid' ? 'Recebido' : 'A receber'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
