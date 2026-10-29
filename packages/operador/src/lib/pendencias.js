// ── Pendências por painel ────────────────────────────────────────────────────
// O que pede AÇÃO do operador em cada painel — é a bolinha vermelha do seletor
// "Passeios | Estacionamento" do admin (e do botão do menu, no celular).
//
//   • Passeios e translados: solicitação aguardando aceite + cotação (rota de
//     translado ou passeio personalizado) aguardando o valor.
//   • Estacionamento: reserva nova aguardando o aceite do parceiro + pedido de
//     alteração de período pendente — o mesmo "acionável" da tela de vagas.
//
// Mesmas chaves de cache (e mesmas funções) das telas: com a tela aberta, as
// consultas são as dela, sem chamada a mais.
import { useQuery } from '@tanstack/react-query'
import { api } from './api'

const lista = (raw) => (Array.isArray(raw) ? raw : (raw?.data || []))
const aguardandoValor = (raw) => lista(raw).filter((q) => q.status === 'pending_quote').length

export function pendenciasPasseios({ bookings, transferQuotes, tourQuotes } = {}) {
  return (bookings?.pending?.length || 0) + aguardandoValor(transferQuotes) + aguardandoValor(tourQuotes)
}

export function pendenciasEstacionamento({ reservas, alteracoes } = {}) {
  return lista(reservas).filter((r) => r.status === 'awaiting_partner').length
    + lista(alteracoes).filter((c) => c.status === 'pending').length
}

// `ativo`: só o admin tem o seletor — operador comum não faz estas consultas.
export function usePendencias({ ativo = true } = {}) {
  const opts = { enabled: ativo, refetchInterval: 30_000, staleTime: 10_000 }
  const { data: bookings }       = useQuery({ queryKey: ['operator-bookings'],   queryFn: () => api.getOperatorBookings(), ...opts, refetchInterval: 15_000 })
  const { data: transferQuotes } = useQuery({ queryKey: ['quotes-pending'],      queryFn: () => api.getPendingQuotes(), ...opts })
  const { data: tourQuotes }     = useQuery({ queryKey: ['tour-quotes-pending'], queryFn: () => api.getPendingTourQuotes(), ...opts })
  const { data: reservas }       = useQuery({ queryKey: ['parking-partner'],     queryFn: () => api.parkingPartnerReservations(), ...opts })
  const { data: alteracoes }     = useQuery({ queryKey: ['parking-changes'],     queryFn: () => api.parkingChangeRequests(), ...opts })
  return {
    tours:   pendenciasPasseios({ bookings, transferQuotes, tourQuotes }),
    parking: pendenciasEstacionamento({ reservas, alteracoes }),
  }
}
