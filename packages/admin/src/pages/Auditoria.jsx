import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ChevronDown, ScrollText } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'

const ACTION_COLORS = {
  create: 'text-green-400 bg-green-900/20',
  update: 'text-blue-400 bg-blue-900/20',
  delete: 'text-red-400 bg-red-900/20',
  login:  'text-gray-400 bg-gray-900',
  status_change: 'text-amber-400 bg-amber-900/20',
}

// Rótulos legíveis: o registro guarda nomes técnicos ("status_change",
// "bookings"); a tela mostra o que aconteceu e em quê. Valor desconhecido
// aparece como veio — dado de auditoria não pode sumir.
const ACAO = {
  create: 'Criação', update: 'Alteração', delete: 'Exclusão', login: 'Login',
  status_change: 'Mudança de status',
}
const ENTIDADE = {
  bookings: 'Reserva', users: 'Usuário', settings: 'Configuração', tours: 'Passeio',
  transfers: 'Translado', transfer_routes: 'Rota de translado', coupons: 'Cupom',
  payouts: 'Repasse', regions: 'Região', pricing_rules: 'Preço', seasons: 'Temporada',
  holidays: 'Feriado', vehicles: 'Veículo', categories: 'Categoria', notifications: 'Notificação',
}

const fmtDate = (s) => {
  try { return format(parseISO(s), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) } catch { return s }
}

export default function Auditoria() {
  const [page, setPage] = useState(1)
  const [aberto, setAberto] = useState(null)  // registro com os detalhes abertos

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn:  () => api.getAuditLogs({ page, limit: 50 }),
    keepPreviousData: true,
  })

  const logs  = data?.data  || []
  const total = data?.total || 0
  const pages = Math.ceil(total / 50)

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-400">{total} registros de auditoria</p>
        <p className="text-xs text-gray-500">Histórico de quem mudou o quê. Toque num registro para ver os detalhes.</p>
      </div>

      {logs.length === 0 ? (
        <Card>
          <div className="py-14 text-center">
            <ScrollText size={36} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-500 text-sm">Nenhum log registrado.</p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-gray-700">
            {logs.map((log) => {
              const aberta = aberto === log.id
              const temDetalhe = !!log.new_values_json
              return (
                <div key={log.id} className="px-4 sm:px-5 py-3">
                  <button
                    type="button"
                    onClick={() => temDetalhe && setAberto(aberta ? null : log.id)}
                    aria-expanded={temDetalhe ? aberta : undefined}
                    className={`w-full text-left ${temDetalhe ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${ACTION_COLORS[log.action_type] || 'text-gray-400 bg-gray-900'}`}>
                        {ACAO[log.action_type] || log.action_type}
                      </span>
                      <span className="text-xs text-gray-500 shrink-0">{fmtDate(log.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1.5 flex items-center gap-1.5 min-w-0">
                      <span className="font-medium truncate">{log.users?.full_name || 'Sistema'}</span>
                      <span className="text-gray-600">·</span>
                      <span className="text-gray-400 shrink-0">{ENTIDADE[log.entity_type] || log.entity_type}</span>
                      {log.entity_id && (
                        <span className="text-gray-600 font-mono text-xs shrink-0">#{log.entity_id?.slice(0, 8)}</span>
                      )}
                      {temDetalhe && (
                        <ChevronDown size={14} className={`ml-auto text-gray-500 shrink-0 transition-transform ${aberta ? 'rotate-180' : ''}`} />
                      )}
                    </p>
                  </button>
                  {temDetalhe && aberta && (
                    <pre className="mt-2 text-[11px] text-gray-400 bg-gray-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(log.new_values_json, null, 2)}
                    </pre>
                  )}
                </div>
              )
            })}
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
      )}
    </div>
  )
}
