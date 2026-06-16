// ── whatsapp.js ────────────────────────────────────────
// Notificações via WhatsApp Business API.
// SEM credenciais configuradas, vira no-op silencioso — nunca derruba o
// fluxo de pagamento/reserva (mesma filosofia do email.js).
//
// Provedor genérico via env (compatível com Z-API, Evolution e a maioria dos
// BSPs que aceitam texto puro):
//   WHATSAPP_API_URL          — endpoint que recebe o POST
//   WHATSAPP_API_KEY          — token de autenticação
//   WHATSAPP_AUTH_HEADER      — nome do header de auth (default: 'Authorization')
//                               se for 'Authorization', envia 'Bearer <key>'
//   WHATSAPP_FIELD_PHONE      — nome do campo do telefone no corpo (default: 'phone')
//   WHATSAPP_FIELD_MESSAGE    — nome do campo do texto no corpo  (default: 'message')
//   COOPERATIVA_URL           — link do painel da cooperativa (no texto da msg)
//
// Para a Cloud API oficial da Meta (templates), basta trocar a função send()
// por um adapter de template — o resto (gatilho, busca de operadores) não muda.

export function isWhatsAppEnabled() {
  return !!(process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_KEY)
}

function onlyDigits(s = '') { return String(s).replace(/\D/g, '') }

// Normaliza para o formato BR com DDI: 55 + DDD + número.
function toBrazilPhone(raw) {
  let d = onlyDigits(raw)
  if (!d) return null
  if (!d.startsWith('55')) d = '55' + d
  return d
}

export async function sendWhatsApp({ to, message }) {
  if (!isWhatsAppEnabled()) return { skipped: true }
  const phone = toBrazilPhone(to)
  if (!phone) return { skipped: true }

  const headerName  = process.env.WHATSAPP_AUTH_HEADER || 'Authorization'
  const headerValue = headerName === 'Authorization'
    ? `Bearer ${process.env.WHATSAPP_API_KEY}`
    : process.env.WHATSAPP_API_KEY
  const phoneField   = process.env.WHATSAPP_FIELD_PHONE   || 'phone'
  const messageField = process.env.WHATSAPP_FIELD_MESSAGE || 'message'

  try {
    const res = await fetch(process.env.WHATSAPP_API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', [headerName]: headerValue },
      body:    JSON.stringify({ [phoneField]: phone, [messageField]: message }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[whatsapp] provider respondeu', res.status, body.slice(0, 300))
      return { error: true }
    }
    return await res.json().catch(() => ({ ok: true }))
  } catch (err) {
    console.error('[whatsapp] falha ao enviar:', err.message)
    return { error: true }
  }
}

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function fmtDateBR(iso) {
  if (!iso) return 'a definir'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Notifica TODAS as cooperativas ativas (com telefone) sobre uma nova reserva
// disponível para aceite. Fire-and-forget — erros nunca sobem.
export async function notifyOperatorsNewBooking(supabase, booking) {
  if (!isWhatsAppEnabled() || !booking) return
  try {
    const { data: operators } = await supabase
      .from('users')
      .select('phone, full_name')
      .eq('user_type', 'operator')
      .eq('is_active', true)
      .not('phone', 'is', null)

    if (!operators?.length) return

    const tipo  = booking.service_type === 'transfer' ? 'Transfer' : 'Passeio'
    const rota  = [booking.origin_text, booking.destination_text].filter(Boolean).join(' → ')
    const data  = fmtDateBR(booking.service_date)
    const time  = booking.service_time ? String(booking.service_time).slice(0, 5) : ''
    const valor = fmtBRL(booking.total_amount)
    const painel = process.env.COOPERATIVA_URL || 'o painel da cooperativa'

    const message =
      `🚨 *Nova reserva disponível!*\n\n` +
      `${tipo}${rota ? ` · ${rota}` : ''}\n` +
      `📅 ${data}${time ? ` às ${time}` : ''}\n` +
      `👥 ${booking.people_count || 1} pessoa(s)\n` +
      `💰 ${valor}\n\n` +
      `Quem aceitar primeiro fica com a corrida. Abra o painel para aceitar:\n${painel}`

    const results = await Promise.allSettled(
      operators.map((op) => sendWhatsApp({ to: op.phone, message })),
    )
    const sent = results.filter((r) => r.status === 'fulfilled' && !r.value?.error && !r.value?.skipped).length
    console.log(`[whatsapp] nova reserva ${booking.booking_code || ''}: notificadas ${sent}/${operators.length} cooperativas`)
  } catch (err) {
    console.error('[whatsapp] notifyOperatorsNewBooking falhou:', err.message)
  }
}
