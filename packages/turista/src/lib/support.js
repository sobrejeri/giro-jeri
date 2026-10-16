// WhatsApp oficial do Turiva (suporte) — FONTE ÚNICA de todos os links "falar
// com a gente" / "suporte via WhatsApp". Formato do wa.me: só dígitos, com o 55
// do Brasil. (+55 88 98158-1999).
//
// Fica fixo no código de propósito: é o número do suporte, muda raramente, e
// depender do campo do admin já trouxe número errado (um placeholder velho
// salvo no banco sobrescrevia o número certo). Para trocar, mude AQUI — um só
// lugar, usado por todas as telas.
export const TURIVA_WHATSAPP = '5588981581999'

// Link de suporte (com texto opcional já preenchido na conversa).
export function waSupportLink(text) {
  return `https://wa.me/${TURIVA_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
