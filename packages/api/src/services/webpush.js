// ── webpush.js ─────────────────────────────────────────
// Envio de Web Push (notificação real no aparelho) via VAPID.
// Só funciona com as variáveis configuradas no servidor:
//   VAPID_PUBLIC_KEY   — chave pública (também exposta ao frontend)
//   VAPID_PRIVATE_KEY  — chave privada
//   VAPID_SUBJECT      — "mailto:voce@exemplo.com" (opcional, tem default)
// Sem elas, vira no-op silencioso (a central no app continua funcionando).

import webpush from 'web-push'
import { supabase } from '../supabase.js'
import { ADMIN_ONLY_KEYS } from './notificationKeys.js'

// Notificações sem ler — o número no ícone do app instalado (Badging API). Mesma
// conta do sininho: as 30 mais recentes; nos apps de turista e operador, sem os
// avisos internos do admin. Null quando não dá para contar (sem a coluna
// read_at, migração 021): o push sai sem número, como antes.
async function naoLidas(userId) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('template_key, read_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) return null
    const abertas = (data || []).filter((n) => !n.read_at)
    return {
      admin: abertas.length,
      apps:  abertas.filter((n) => !ADMIN_ONLY_KEYS.includes(n.template_key)).length,
    }
  } catch {
    return null
  }
}

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

// O servidor consegue ENVIAR push? (VAPID público + privado presentes e
// válidos). O frontend usa isto para avisar quando "ativar" funciona no
// aparelho mas o servidor ainda não está configurado para disparar.
export function isConfigured() {
  return ensureConfigured();
}

// Envia um push para TODOS os dispositivos inscritos de um usuário.
// Remove inscrições expiradas (404/410). Nunca lança — é fire-and-forget.
export async function sendPushToUser(userId, { title, body, bookingId = null, templateKey = null, onlyApps = null, image = null, url = null }) {
  if (!userId || !ensureConfigured()) return

  // `app` diz de qual PWA é a inscrição: filtra o envio e escolhe o número do
  // ícone (o do admin conta também os avisos internos).
  let query = supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, app')
    .eq('user_id', userId)
  // Restringe a certos PWAs (ex.: avisos internos só no app do admin).
  if (Array.isArray(onlyApps) && onlyApps.length) query = query.in('app', onlyApps)

  let { data: subs, error } = await query
  // Fallback: coluna `app` ainda não existe (migração 095) → ignora o filtro.
  if (error && /app/.test(error.message || '')) {
    ({ data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId))
  }

  if (!subs?.length) return

  const base = {
    title: title || 'Turiva',
    body:  body || '',
    bookingId,
    templateKey,
    ...(image ? { image } : {}),
    ...(url ? { url } : {}),
  }
  const contagem = await naoLidas(userId)
  const payloadDe = (s) => JSON.stringify(
    contagem ? { ...base, badge: s.app === 'admin' ? contagem.admin : contagem.apps } : base,
  )

  await Promise.allSettled(
    subs.map(async (s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      }
      try {
        await webpush.sendNotification(subscription, payloadDe(s))
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
