// Número de notificações não lidas no ícone do app instalado (Badging API).
//
// Com o app fechado, quem põe o número é o service worker, quando o push chega:
// o servidor manda `badge` (as não lidas daquele app). Com o app aberto, o
// componente SeloDoApp acompanha o sininho. Aqui os três service workers rodam
// de verdade (vm) com um push simulado, e o resto é asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')

// Carrega um sw.js num contexto com um `self` falso e devolve um disparador de push.
function carregarSW(rel, { comSelo = true } = {}) {
  const handlers = {}
  const chamadas = { set: [], clear: 0, notificacoes: 0 }
  const navigator = comSelo ? {
    setAppBadge:   (n) => { chamadas.set.push(n); return Promise.resolve() },
    clearAppBadge: () => { chamadas.clear++; return Promise.resolve() },
  } : {}
  const self = {
    addEventListener: (tipo, fn) => { handlers[tipo] = fn },
    registration: {
      scope: 'https://app.teste/',
      showNotification: () => { chamadas.notificacoes++; return Promise.resolve() },
    },
    navigator,
    location: { origin: 'https://app.teste' },
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]) },
    skipWaiting: () => {},
  }
  vm.runInContext(ler(rel), vm.createContext({ self, caches: {}, URL, Promise, console }))
  async function push(dados) {
    let pendente
    handlers.push({ data: { json: () => dados }, waitUntil: (p) => { pendente = p } })
    await pendente
  }
  return { push, chamadas }
}

for (const app of ['turista', 'operador', 'admin']) {
  const sw = `../../${app}/public/sw.js`

  test(`${app}: push com 3 não lidas põe "3" no ícone e mostra a notificação`, async () => {
    const { push, chamadas } = carregarSW(sw)
    await push({ title: 'Nova', body: 'x', badge: 3 })
    assert.deepEqual(chamadas.set, [3])
    assert.equal(chamadas.notificacoes, 1)
  })

  test(`${app}: push com 0 não lidas limpa o ícone`, async () => {
    const { push, chamadas } = carregarSW(sw)
    await push({ title: 'Nova', body: 'x', badge: 0 })
    assert.equal(chamadas.clear, 1)
    assert.deepEqual(chamadas.set, [])
  })

  test(`${app}: push sem número (servidor antigo) não mexe no ícone`, async () => {
    const { push, chamadas } = carregarSW(sw)
    await push({ title: 'Nova', body: 'x' })
    assert.deepEqual(chamadas.set, [])
    assert.equal(chamadas.clear, 0)
    assert.equal(chamadas.notificacoes, 1)
  })

  test(`${app}: aparelho sem suporte (Android) só mostra a notificação`, async () => {
    const { push, chamadas } = carregarSW(sw, { comSelo: false })
    await push({ title: 'Nova', body: 'x', badge: 5 })
    assert.equal(chamadas.notificacoes, 1)
  })
}

test('o push leva as não lidas DAQUELE app (o admin conta os avisos internos)', () => {
  const wp = ler('../src/services/webpush.js')
  assert.match(wp, /import \{ ADMIN_ONLY_KEYS \} from '\.\/notificationKeys\.js'/)
  assert.match(wp, /\.limit\(30\)/, 'mesma janela do sininho (30 mais recentes)')
  assert.match(wp, /badge: s\.app === 'admin' \? contagem\.admin : contagem\.apps/)
  assert.match(wp, /select\('id, endpoint, p256dh, auth, app'\)/)
})

test('com o app aberto, o número acompanha o sininho; no logout, limpa', () => {
  for (const app of ['turista', 'operador', 'admin']) {
    const comp = ler(`../../${app}/src/components/SeloDoApp.jsx`)
    assert.match(comp, /queryKey:\s+\['notifications'\]/, `${app}: mesma consulta do sininho`)
    assert.match(comp, /definirSeloDoApp\(unread\)/)
    const push = ler(`../../${app}/src/lib/push.js`)
    assert.match(push, /export async function disablePush\(\) \{\s*\/\/[^\n]*\n\s*definirSeloDoApp\(0\)/, `${app}: logout limpa o ícone`)
  }
  assert.match(ler('../../turista/src/App.jsx'), /<SeloDoApp \/>/)
  assert.match(ler('../../operador/src/components/layout/Layout.jsx'), /<SeloDoApp \/>/)
  assert.match(ler('../../admin/src/components/layout/Layout.jsx'), /<SeloDoApp \/>/)
})

// ── Servidor: o número que vai em cada push ─────────────────────────────────
// Roda o sendPushToUser de verdade, com o cliente do Supabase e o web-push
// trocados por falsos (o objeto do cliente é compartilhado entre os módulos).
async function servidorFalso({ notificacoes, inscricoes, semReadAt = false, semApp = false }) {
  process.env.SUPABASE_URL ||= 'http://supabase.teste'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'sb_secret_teste'
  process.env.VAPID_PUBLIC_KEY ||= 'pub-teste'
  process.env.VAPID_PRIVATE_KEY ||= 'pri-teste'
  const { supabase } = await import('../src/supabase.js')
  const webpush = (await import('web-push')).default
  webpush.setVapidDetails = () => {}
  const enviados = []
  webpush.sendNotification = async (sub, payload) => { enviados.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }) }
  supabase.from = (tabela) => {
    const filtros = []; let colunas = ''
    const q = {
      select(c) { colunas = c; return q },
      eq(c, v) { filtros.push((r) => r[c] === v); return q },
      in(c, vs) { filtros.push((r) => vs.includes(r[c])); return q },
      order() { return q },
      limit() { return q },
      delete() { return q },
      then(ok, erro) {
        let r
        if (tabela === 'notifications' && semReadAt) r = { data: null, error: { code: '42703', message: 'column notifications.read_at does not exist' } }
        else if (tabela === 'push_subscriptions' && semApp && /\bapp\b/.test(colunas)) r = { data: null, error: { code: '42703', message: 'column push_subscriptions.app does not exist' } }
        else {
          const linhas = (tabela === 'notifications' ? notificacoes : inscricoes).filter((x) => filtros.every((f) => f(x)))
          r = { data: semApp ? linhas.map(({ app, ...resto }) => resto) : linhas, error: null }
        }
        return Promise.resolve(r).then(ok, erro)
      },
    }
    return q
  }
  const { sendPushToUser } = await import('../src/services/webpush.js')
  return { sendPushToUser, enviados }
}

const U = 'user-1'
const NOTIFS = [
  { user_id: U, template_key: 'booking_accepted', read_at: null },
  { user_id: U, template_key: 'new_booking',      read_at: null },
  { user_id: U, template_key: 'admin_new_user',   read_at: null },          // aviso interno: só conta no admin
  { user_id: U, template_key: 'booking_accepted', read_at: '2026-10-01' },  // lida
]
const INSCRICOES = ['turista', 'operador', 'admin'].map((app) => ({ id: app, user_id: U, endpoint: `https://push/${app}`, p256dh: 'k', auth: 'a', app }))

test('servidor: cada app recebe as SUAS não lidas (o admin conta os avisos internos)', async () => {
  const { sendPushToUser, enviados } = await servidorFalso({ notificacoes: NOTIFS, inscricoes: INSCRICOES })
  await sendPushToUser(U, { title: 'Oi', body: 'Teste' })
  const por = Object.fromEntries(enviados.map((e) => [e.endpoint.split('/').pop(), e.badge]))
  assert.deepEqual(por, { turista: 2, operador: 2, admin: 3 })
})

test('servidor: onlyApps continua restringindo o envio', async () => {
  const { sendPushToUser, enviados } = await servidorFalso({ notificacoes: NOTIFS, inscricoes: INSCRICOES })
  await sendPushToUser(U, { title: 'Oi', body: 'Teste', onlyApps: ['turista'] })
  assert.deepEqual(enviados.map((e) => e.endpoint), ['https://push/turista'])
})

test('servidor: sem a coluna read_at o push sai sem número (como antes)', async () => {
  const { sendPushToUser, enviados } = await servidorFalso({ notificacoes: NOTIFS, inscricoes: INSCRICOES, semReadAt: true })
  await sendPushToUser(U, { title: 'Oi', body: 'Teste' })
  assert.equal(enviados.length, 3)
  assert.ok(enviados.every((e) => !('badge' in e)))
})

test('servidor: sem a coluna app (095) envia a todos com a conta dos apps', async () => {
  const { sendPushToUser, enviados } = await servidorFalso({ notificacoes: NOTIFS, inscricoes: INSCRICOES, semApp: true })
  await sendPushToUser(U, { title: 'Oi', body: 'Teste' })
  assert.equal(enviados.length, 3)
  assert.ok(enviados.every((e) => e.badge === 2))
})
