// ── Split do Pagar.me ──────────────────────────────────────────────────────
//
// A REGRA DE PERCENTUAL É A MESMA DO MERCADO PAGO. Ela vem de
// `mediaPonderadaDoPercentual` (routes/payments.js), importada, não copiada:
// duas cópias divergiriam, e divergir aqui significa dividir dinheiro de dois
// jeitos diferentes conforme o adquirente que atendeu o cliente.
//
// ── A diferença em relação ao Mercado Pago ────────────────────────────────
//
// No MP, a cobrança nasce na conta do operador e o gateway desconta a taxa de
// quem recebeu — ou seja, do operador. Para o operador receber a fatia LIMPA,
// o código do MP precisa derivar a comissão ao contrário:
//     comissão = total − (líquidoDoOperador + taxa)
//
// No Pagar.me isso é nativo: `charge_processing_fee: true` na plataforma faz a
// taxa sair da parte DELA. Então aqui não se recalcula nada — o percentual é
// aplicado direto e a opção cuida da taxa. Mesmo resultado, sem a aritmética.
//
// ── Fail-closed ───────────────────────────────────────────────────────────
//
// Sem recebedor do operador ou da plataforma, esta função devolve `null` e
// quem chama RECUSA a cobrança. Cobrar sem split e "acertar depois" vira
// divergência de caixa — e o dinheiro já entrou inteiro numa conta só.

/** Soma dos percentuais tem de fechar 100 — o Pagar.me recusa o contrário. */
const CEM = 100

/**
 * Monta o array `split` do pedido.
 *
 * @param {object}  p
 * @param {number}  p.pctPlataforma  percentual da plataforma (0–100)
 * @param {string}  p.recebedorPlataforma  rp_... da plataforma
 * @param {string}  p.recebedorOperador    rp_... do operador
 * @returns {Array|null} o array de split, ou null quando não dá para dividir
 */
export function montarSplit({ pctPlataforma, recebedorPlataforma, recebedorOperador }) {
  const plataforma = String(recebedorPlataforma || '').trim()
  const operador   = String(recebedorOperador   || '').trim()
  if (!plataforma || !operador) return null

  // Um recebedor não pode aparecer duas vezes: o Pagar.me recusa, e mesmo que
  // aceitasse seria a plataforma dividindo consigo mesma.
  if (plataforma === operador) return null

  const pct = Number(pctPlataforma)
  if (!Number.isFinite(pct) || pct < 0 || pct > CEM) return null

  // Percentual inteiro: a API aceita só número, e 9.7 viraria arredondamento
  // silencioso do lado deles. Arredondar aqui deixa a conta explícita — e o
  // que a plataforma perde ou ganha no arredondamento é dela, não do operador.
  const daPlataforma = Math.round(pct)
  const doOperador   = CEM - daPlataforma

  // Split de 0% para alguém é pedido recusado. Se a comissão arredondar para
  // zero (ou para 100), não há o que dividir — melhor não dividir do que
  // mandar um pedido que o gateway rejeita no meio do checkout.
  if (daPlataforma <= 0 || doOperador <= 0) return null

  return [
    {
      amount:       daPlataforma,
      type:         'percentage',
      recipient_id: plataforma,
      options: {
        // A plataforma é a recebedora principal: responde pelo chargeback,
        // paga a taxa do gateway e absorve a sobra de arredondamento.
        liable:                true,
        charge_processing_fee: true,
        charge_remainder_fee:  true,
      },
    },
    {
      amount:       doOperador,
      type:         'percentage',
      recipient_id: operador,
      options: {
        // O operador recebe a fatia dele LIMPA. É o mesmo resultado que o
        // caminho do Mercado Pago produz pela aritmética da comissão.
        liable:                false,
        charge_processing_fee: false,
        charge_remainder_fee:  false,
      },
    },
  ]
}

/** Confere que o split fecha 100% — usado em teste e antes de enviar. */
export function fecha100(split) {
  if (!Array.isArray(split) || split.length === 0) return false
  return split.reduce((s, r) => s + Number(r.amount || 0), 0) === CEM
}
