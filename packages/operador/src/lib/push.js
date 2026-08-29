import { api } from './api'

// Converte a chave VAPID (base64url) para o formato que o pushManager espera.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  const arr     = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export function pushPermission() {
  return pushSupported() ? Notification.permission : 'unsupported'
}

// Registra o service worker, pede permissão e inscreve o navegador no push.
// Retorna { ok, reason }. Nunca lança.
export async function enablePush() {
  try {
    if (!pushSupported()) return { ok: false, reason: 'unsupported' }

    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: 'denied' }

    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
    await navigator.serviceWorker.ready

    const { key } = await api.getVapidKey()
    if (!key) return { ok: false, reason: 'server' }

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })
    }

    const json = sub.toJSON()
    await api.pushSubscribe({
      endpoint: json.endpoint,
      keys:     { p256dh: json.keys.p256dh, auth: json.keys.auth },
    })
    return { ok: true }
  } catch (err) {
    console.error('[push] enable falhou:', err?.message)
    return { ok: false, reason: 'error' }
  }
}
