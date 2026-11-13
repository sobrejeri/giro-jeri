import { supabase } from '../supabase.js'

// Passeio/rota SOB COTAÇÃO (migration 128) não tem valor fixo: a rota guarda
// um default_price que não vale (pode ser zero) e o passeio pode ter regras
// antigas no Motor de Preços. Reservar pelo fluxo normal cobraria esse valor;
// o pedido tem de ir pela cotação. Validado no SERVIDOR — a tela já leva para
// a cotação, mas regra só na tela é contornável chamando a API.
// Reserva vinda de cotação aceita aponta para a COTAÇÃO (service_id = id da
// cotação), não para o passeio/rota, e por isso nunca cai aqui.
export async function checkQuoteOnly({ service_type, service_id }) {
  if (!service_id) return null
  const tabela = service_type === 'tour' ? 'tours'
    : service_type === 'transfer' ? 'transfer_routes' : null
  if (!tabela) return null
  const { data, error } = await supabase.from(tabela).select('quote_only').eq('id', service_id).maybeSingle()
  if (error) return null   // migration 128 pendente: nada é sob cotação ainda
  return data?.quote_only
    ? 'Este serviço é sob cotação: peça o valor pela tela de cotação do app.'
    : null
}
