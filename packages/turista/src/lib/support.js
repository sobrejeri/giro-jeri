// WhatsApp oficial do Turiva (suporte) — fonte ÚNICA usada em todos os links
// "falar com a gente". Formato do wa.me: só dígitos, com o 55 do Brasil.
// (+55 88 98158-1999)
//
// O admin pode sobrescrever em Configurações → "WhatsApp do suporte"
// (settings.whatsapp_support_number, já exposto no /settings/public); quando a
// tela tem os settings à mão, use waSupportLink(settings) para priorizar o valor
// do admin e cair neste número só como padrão.
export const TURIVA_WHATSAPP = '5588981581999'

// Normaliza um número qualquer para o formato do wa.me (só dígitos, com 55 se
// faltar o país). Vazio → cai no número oficial do Turiva.
export function waNumber(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  if (!d) return TURIVA_WHATSAPP
  return d.length <= 11 ? '55' + d : d
}

// Link de suporte: usa o número do admin (settings) ou o padrão do Turiva.
export function waSupportLink(settings, text) {
  const num = settings?.whatsapp_support_number ? waNumber(settings.whatsapp_support_number) : TURIVA_WHATSAPP
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
