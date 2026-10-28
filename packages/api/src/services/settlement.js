// Liquidação dos recebíveis ("creditado") — a partir de quando o dinheiro de um
// pagamento cai na conta. Regra do negócio (aprox. por dias ÚTEIS, feriados NÃO
// entram; é apuração INFORMATIVA, não movimenta dinheiro):
//   • PIX e Mercado Pago → 1º dia útil após o pagamento (D+1 útil)
//   • Cartão (Pagar.me)   → 2º dia útil após o pagamento (D+2 úteis)

const TZ = 'America/Fortaleza'

// 'YYYY-MM-DD' de uma data no fuso de Jeri.
function diaJeri(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export function hojeJeri() {
  return diaJeri(new Date())
}

// Dias úteis de crédito conforme gateway + método do pagamento.
export function diasUteisCredito(gatewayName, paymentMethod) {
  const g = String(gatewayName || '').toLowerCase()
  const m = String(paymentMethod || '').toLowerCase()
  const isMP  = g.includes('mercado') || g === 'mp'
  const isPix = m.includes('pix')
  return (isMP || isPix) ? 1 : 2
}

// Soma N dias ÚTEIS (pula sábado/domingo) a uma data 'YYYY-MM-DD' e devolve
// 'YYYY-MM-DD'. Aritmética em UTC de propósito: trabalha só com a data, sem o
// fuso deslocar o dia. Feriados não são considerados (aproximação).
export function somaDiasUteis(diaYmd, n) {
  const [y, mo, d] = String(diaYmd).split('-').map(Number)
  if (!y || !mo || !d) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  let add = 0
  while (add < n) {
    dt.setUTCDate(dt.getUTCDate() + 1)
    const wd = dt.getUTCDay() // 0 domingo … 6 sábado
    if (wd !== 0 && wd !== 6) add++
  }
  return dt.toISOString().slice(0, 10)
}

// Já foi creditado? Compara a data de liquidação do pagamento com HOJE (fuso de
// Jeri). Sem data do pagamento → trata como ainda não creditado (conservador).
export function jaCreditado({ gatewayName, paymentMethod, paidAt }, hoje = hojeJeri()) {
  if (!paidAt) return false
  const diaPag  = diaJeri(new Date(paidAt))
  const credito = somaDiasUteis(diaPag, diasUteisCredito(gatewayName, paymentMethod))
  return !!credito && credito <= hoje // 'YYYY-MM-DD' compara lexicograficamente
}
