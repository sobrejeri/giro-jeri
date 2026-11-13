// Comissões devidas à empresa: uma linha por reserva, com o operador da equipe
// que originou a venda.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import Card, { CardBody } from '../../components/ui/Card'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const SITUACAO = {
  pending:   ['Pendente',  'bg-amber-100 text-amber-700'],
  paid:      ['Pago',      'bg-green-100 text-green-700'],
  cancelled: ['Cancelado', 'bg-gray-100 text-gray-500'],
}

export default function Comissoes() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    api.getCompanyCommissions()
      .then((r) => { if (active) setRows(r?.rows || []) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [])

  const soma = (st) => (rows || []).filter((r) => r.status === st).reduce((s, r) => s + Number(r.amount || 0), 0)

  return (
    <div className="space-y-4">
      {rows?.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card><CardBody><p className="text-xs text-gray-500">A receber</p><p className="text-lg font-bold text-gray-900">{moeda.format(soma('pending'))}</p></CardBody></Card>
          <Card><CardBody><p className="text-xs text-gray-500">Já recebido</p><p className="text-lg font-bold text-gray-900">{moeda.format(soma('paid'))}</p></CardBody></Card>
        </div>
      )}
      <Card aria-label="Comissões da empresa">
        <CardBody>
          <h2 className="font-semibold text-gray-900">Comissões da empresa</h2>
          {error && <p role="alert" className="mt-2 text-sm text-red-700">Não foi possível carregar as comissões.</p>}
          {!error && rows === null && <p className="mt-2 text-sm text-gray-600">Carregando comissões…</p>}
          {rows?.length === 0 && <p className="mt-2 text-sm text-gray-600">Nenhuma comissão registrada. Elas aparecem aqui quando uma reserva de um operador da equipe é paga.</p>}
          {rows?.length > 0 && (
            <>
              <p className="mt-1 text-sm text-gray-600">Até 50 lançamentos mais recentes.</p>
              <ul className="divide-y divide-gray-100 mt-2">
                {rows.map((row) => {
                  const [rotulo, cor] = SITUACAO[row.status] || [row.status, 'bg-gray-100 text-gray-600']
                  return (
                    <li key={row.id} className="flex justify-between gap-3 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{row.bookings?.booking_code || 'Reserva'}</p>
                        <p className="text-gray-600 truncate">{row.operator?.full_name || 'Operador indisponível'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium text-gray-900">{moeda.format(row.amount)}</p>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{rotulo}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
