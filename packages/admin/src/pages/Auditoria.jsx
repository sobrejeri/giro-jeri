import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'

const ACTION_COLORS = {
  create: 'text-green-400 bg-green-900/20',
  update: 'text-blue-400 bg-blue-900/20',
  delete: 'text-red-400 bg-red-900/20',
  login:  'text-gray-400 bg-gray-800',
}

const fmtDate = (s) => {
  try { return format(parseISO(s), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) } catch { return s }
}

export default function Auditoria() {
  const [page, setPage] = useState(1)

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
      <p className="text-sm text-gray-500">{total} registros de auditoria</p>

      {logs.length === 0 ? (
        <Card>
          <div className="py-14 text-center">
            <ScrollText size={36} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-500 text-sm">Nenhum log registrado.</p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-gray-800">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-4 px-5 py-3 hover:bg-gray-750 transition-colors">
                {/* Ação */}
                <span className={`mt-0.5 flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md ${ACTION_COLORS[log.action_type] || 'text-gray-400 bg-gray-800'}`}>
                  {log.action_type}
                </span>

                {/* Detalhes */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300">
                    <span className="font-medium">{log.users?.full_name || 'Sistema'}</span>
                    {' · '}
                    <span className="text-gray-500">{log.entity_type}</span>
                    {log.entity_id && (
                      <span className="text-gray-600 font-mono text-xs ml-1">#{log.entity_id?.slice(0, 8)}</span>
                    )}
                  </p>
                  {log.new_values_json && (
                    <pre className="text-xs text-gray-600 mt-0.5 truncate">
                      {JSON.stringify(log.new_values_json)}
                    </pre>
                  )}
                </div>

                {/* Data */}
                <span className="text-xs text-gray-600 flex-shrink-0">{fmtDate(log.created_at)}</span>
              </div>
            ))}
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
