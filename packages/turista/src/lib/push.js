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

// iPhone/iPad: o Web Push SÓ funciona com o app instalado na Tela de Início.
export function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// App aberto pelo ícone (PWA instalado) x aba do navegador.
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true
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
      app:      'turista',
    })
    return { ok: true }
  } catch (err) {
    console.error('[push] enable falhou:', err?.message)
    return { ok: false, reason: 'error' }
  }
}

// Remove a inscrição DESTE aparelho no servidor (chamado no logout). Sem isso, o
// servidor continua mandando push mesmo com o app deslogado (a entrega é no
// nível do SO). Mantém a inscrição do navegador viva para re-login silencioso
// via syncPush(). Nunca lança.
export async function disablePush() {
  try {
    if (!pushSupported()) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = reg && (await reg.pushManager.getSubscription())
    if (sub?.endpoint) await api.pushUnsubscribe({ endpoint: sub.endpoint })
  } catch (err) { console.error('[push] disable falhou:', err?.message) }
}

// Re-registra a inscrição no servidor após login — SEM prompt e SEM teste, só se
// a permissão já foi concedida. Quem já ativou volta a receber ao logar de novo,
// sem tocar em "Ativar". Nunca lança.
export async function syncPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
    await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const { key } = await api.getVapidKey()
      if (!key) return
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
    }
    const j = sub.toJSON()
    await api.pushSubscribe({ endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, app: 'turista' })
  } catch (err) { console.error('[push] sync falhou:', err?.message) }
}
