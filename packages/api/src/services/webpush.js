// ── webpush.js ─────────────────────────────────────────
// Envio de Web Push (notificação real no aparelho) via VAPID.
// Só funciona com as variáveis configuradas no servidor:
//   VAPID_PUBLIC_KEY   — chave pública (também exposta ao frontend)
//   VAPID_PRIVATE_KEY  — chave privada
//   VAPID_SUBJECT      — "mailto:voce@exemplo.com" (opcional, tem default)
// Sem elas, vira no-op silencioso (a central no app continua funcionando).

import webpush from 'web-push'
import { supabase } from '../supabase.js'

let configured = false
function ensureConfigured() {
  if (configured) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const pri = process.env.VAPID_PRIVATE_KEY
  if (!pub || !pri) return false
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contato@girojeri.com', pub, pri)
    configured = true
    return true
  } catch (err) {
    console.error('[webpush] configuração inválida:', err.message)
    return false
  }
}

// Envia um push para TODOS os dispositivos inscritos de um usuário.
// Remove inscrições expiradas (404/410). Nunca lança — é fire-and-forget.
export async function sendPushToUser(userId, { title, body, bookingId = null, templateKey = null }) {
  if (!userId || !ensureConfigured()) return

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs?.length) return

  const payload = JSON.stringify({
    title: title || 'Giro Jeri',
    body:  body || '',
    bookingId,
    templateKey,
  })

  await Promise.allSettled(
    subs.map(async (s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      }
      try {
        await webpush.sendNotification(subscription, payload)
      } catch (err) {
        // 404/410 = inscrição morta → remove
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
        } else {
          console.error('[webpush] envio falhou:', err?.statusCode || err?.message)
        }
      }
    }),
  )
}
