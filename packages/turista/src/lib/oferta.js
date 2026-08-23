// ── Oferta guardada ─────────────────────────────────────────────────────────
// O cliente recebe o cupom no WhatsApp e toca em "Quero a oferta". O código
// fica guardado no aparelho e aparece já preenchido no carrinho e no resumo da
// reserva — sem isso ele teria de decorar o código e digitar na mão, que é
// exatamente onde a oferta se perde.
//
// Fica no localStorage e não no servidor de propósito: quem chega pelo link
// pode nem estar logado, e a oferta precisa sobreviver até o cadastro.
const CHAVE = 'turiva_oferta'

export function guardarOferta(code) {
  const limpo = String(code || '').trim().toUpperCase()
  if (!limpo) return
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ code: limpo, em: Date.now() }))
  } catch { /* navegação privada: a oferta só não fica guardada */ }
}

export function lerOferta() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return null
    const o = JSON.parse(cru)
    // 60 dias: cupom antigo preenchido sozinho no checkout vira erro
    // ("cupom expirado") sem o cliente entender de onde veio.
    if (!o?.code || Date.now() - (o.em || 0) > 60 * 86400 * 1000) {
      localStorage.removeItem(CHAVE)
      return null
    }
    return o.code
  } catch { return null }
}

export function limparOferta() {
  try { localStorage.removeItem(CHAVE) } catch { /* nada a fazer */ }
}
