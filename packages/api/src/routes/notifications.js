import { Router }       from 'express'
import { supabase }     from '../supabase.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { isWhatsappEnabled, sendTestMessage } from '../services/whatsapp.js'
import { sendPushToUser, isConfigured as pushConfigured } from '../services/webpush.js'
import { notifyUser, getTemplate, DEFAULT_TEMPLATES } from '../services/notify.js'

const router = Router()

// ── GET /api/notifications/wa-diag — diagnóstico Z-API (admin) ──
// Confirma se as 3 envs Z-API estão setadas (sem expor valores).
router.get('/wa-diag', authenticate, requireAdmin, (_req, res) => {
  res.json({
    enabled:            isWhatsappEnabled(),
    has_instance_id:    !!process.env.ZAPI_INSTANCE_ID,
    has_instance_token: !!process.env.ZAPI_INSTANCE_TOKEN,
    has_client_token:   !!process.env.ZAPI_CLIENT_TOKEN,
    base_url:           process.env.ZAPI_BASE_URL || 'https://api.z-api.io',
  })
})

// ── POST /api/notifications/wa-test — envia msg de teste (admin) ──
// body: { phone: '+5588...' }. Retorna a resposta crua da Z-API.
router.post('/wa-test', authenticate, requireAdmin, async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  if (!phone) return res.status(400).json({ error: 'Informe um phone (ex.: +5588999999999)' })
  const result = await sendTestMessage(phone)
  res.json(result)
})

// ── GET /api/notifications — minhas notificações + total não lidas ──
// Avisos internos (só fazem sentido no PWA do admin). Nos apps de
// turista/operador eles são escondidos da central mesmo que o usuário tenha
// os dois papéis na mesma conta.
const ADMIN_ONLY_KEYS = ['admin_new_user', 'admin_payment_approved', 'admin_payment_rejected']
function filtrarPorApp(items, app) {
  if (app === 'turista' || app === 'operador') {
    return items.filter((n) => !ADMIN_ONLY_KEYS.includes(n.template_key))
  }
  return items
}

router.get('/', authenticate, async (req, res) => {
  const app = req.query.app
  // Caminho normal (após a migração 021, com a coluna read_at)
  const withRead = await supabase
    .from('notifications')
    .select('id, title, message_body, template_key, booking_id, read_at, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  if (!withRead.error) {
    const items = filtrarPorApp(withRead.data || [], app)
    return res.json({ items, unread: items.filter((n) => !n.read_at).length })
  }

  // Fallback antes da migração (sem read_at): mostra a lista mesmo assim,
  // tratando tudo como já lido (sem badge preso) até a migração ser aplicada.
  const basic = await supabase
    .from('notifications')
    .select('id, title, message_body, template_key, booking_id, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  if (basic.error) {
    console.error('[notifications] list falhou:', basic.error.message)
    return res.json({ items: [], unread: 0 })
  }
  const items = filtrarPorApp((basic.data || []).map((n) => ({ ...n, read_at: '1970-01-01T00:00:00Z' })), app)
  res.json({ items, unread: 0 })
})

// ── POST /api/notifications/read-all — marca todas como lidas ──
router.post('/read-all', authenticate, async (req, res) => {
  try {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', req.user.id)
      .is('read_at', null)
    res.json({ ok: true })
  } catch (err) {
    console.error('[notifications] read-all falhou:', err.message)
    res.json({ ok: false })
  }
})

// ── DELETE /api/notifications/:id — exclui após o clique/ação ──
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await supabase
      .from('notifications')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[notifications] delete falhou:', err.message)
    res.json({ ok: false })
  }
})

// ── POST /api/notifications/:id/read — marca uma como lida ──
router.post('/:id/read', authenticate, async (req, res) => {
  try {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .is('read_at', null)
    res.json({ ok: true })
  } catch (err) {
    console.error('[notifications] read falhou:', err.message)
    res.json({ ok: false })
  }
})

// =============================================================================
// WEB PUSH (Fase 2) — chave pública VAPID + inscrição do navegador
// =============================================================================

// ── GET /api/notifications/vapid-public-key ──
router.get('/vapid-public-key', (_req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null })
})

// ── POST /api/notifications/push-subscribe — salva a inscrição do navegador ──
router.post('/push-subscribe', authenticate, async (req, res) => {
  try {
    const { endpoint, keys, app } = req.body || {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Inscrição de push inválida' })
    }
    const appTag = ['turista', 'operador', 'admin'].includes(app) ? app : null
    const row = {
      user_id:    req.user.id,
      endpoint,
      p256dh:     keys.p256dh,
      auth:       keys.auth,
      user_agent: req.headers['user-agent'] || null,
    }
    if (appTag) row.app = appTag
    const { error: upErr } = await supabase
      .from('push_subscriptions')
      .upsert(row, { onConflict: 'user_id,endpoint' })
    // Fallback: coluna `app` ainda não existe (migração 095 não aplicada).
    if (upErr && /app/.test(upErr.message || '')) {
      delete row.app
      await supabase.from('push_subscriptions').upsert(row, { onConflict: 'user_id,endpoint' })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[notifications] push-subscribe falhou:', err.message)
    res.status(500).json({ error: 'Falha ao salvar inscrição de push' })
  }
})

// ── POST /api/notifications/push-test — envia um push de teste para si mesmo ──
router.post('/push-test', authenticate, async (req, res) => {
  try {
    const configured = pushConfigured()
    const { count } = await supabase
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
    if (!count) return res.json({ ok: false, reason: 'no_subscription', configured })
    // Servidor sem VAPID → o aparelho até se inscreve, mas nada é enviado.
    // Devolve isso explícito pro app avisar em vez de fingir que deu certo.
    if (!configured) return res.json({ ok: false, reason: 'server_not_configured', configured: false, devices: count })
    await sendPushToUser(req.user.id, {
      title: 'Turiva 🔔',
      body:  'Notificações ativadas! É assim que você vai receber avisos.',
    })
    res.json({ ok: true, devices: count, configured: true })
  } catch (err) {
    console.error('[notifications] push-test falhou:', err.message)
    res.status(500).json({ error: 'Falha ao enviar teste' })
  }
})

// =============================================================================
// ADMIN — modelos automáticos + envio manual (broadcast)
// =============================================================================

const TEMPLATE_KEYS = [
  'welcome', 'birthday', 'cart_reminder', 'cart_pending',
  'admin_new_user', 'admin_payment_approved', 'admin_payment_rejected',
]

// ── GET /api/notifications/templates (admin) ──
router.get('/templates', authenticate, requireAdmin, async (_req, res) => {
  const out = []
  for (const key of TEMPLATE_KEYS) {
    const t = await getTemplate(key)
    out.push({ key, enabled: t?.enabled ?? true, title: t?.title || '', body: t?.body || '' })
  }
  res.json(out)
})

// ── PUT /api/notifications/templates/:key (admin) ──
router.put('/templates/:key', authenticate, requireAdmin, async (req, res) => {
  const { key } = req.params
  if (!TEMPLATE_KEYS.includes(key)) return res.status(400).json({ error: 'Modelo inválido' })
  const enabled = req.body?.enabled !== false
  const title = String(req.body?.title || DEFAULT_TEMPLATES[key].title).slice(0, 120)
  const body  = String(req.body?.body  || DEFAULT_TEMPLATES[key].body).slice(0, 400)
  try {
    const { data, error } = await supabase
      .from('notification_templates')
      .upsert({ key, enabled, title, body, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select().single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('[notifications] update template falhou:', err.message)
    res.status(500).json({ error: 'Falha ao salvar (rodou a migração 092?)' })
  }
})

// ── POST /api/notifications/broadcast (admin) ──
// Envia um push + notificação na central para um público.
//   audience: 'all' | 'subscribed' | 'with_booking' | 'no_booking'
router.post('/broadcast', authenticate, requireAdmin, async (req, res) => {
  try {
    const title = String(req.body?.title || 'Turiva').slice(0, 120)
    const body  = String(req.body?.body || '').trim().slice(0, 400)
    const audience = req.body?.audience || 'all'
    // Prévia de imagem (estilo Instagram) e destino do clique — opcionais.
    const image = /^https?:\/\//.test(req.body?.image || '') ? String(req.body.image).slice(0, 1000) : null
    const url   = req.body?.url ? String(req.body.url).slice(0, 300) : null
    // Destino = qual público/PWA recebe. 'turista' (padrão) mantém os
    // sub-filtros de audiência; 'operador'/'admin' vão para todos do tipo.
    const target = ['turista', 'operador', 'admin'].includes(req.body?.target) ? req.body.target : 'turista'
    if (!body) return res.status(400).json({ error: 'Escreva a mensagem' })

    let userIds = []
    if (target === 'operador') {
      const { data: us } = await supabase.from('users').select('id').eq('user_type', 'operator').eq('is_active', true)
      userIds = (us || []).map((u) => u.id)
    } else if (target === 'admin') {
      const { data: us } = await supabase.from('users').select('id').eq('user_type', 'admin').eq('is_active', true)
      userIds = (us || []).map((u) => u.id)
    } else if (audience === 'subscribed') {
      // Turistas que ativaram push (inscrições do app do turista).
      const { data } = await supabase.from('push_subscriptions').select('user_id, app')
      const tur = new Set((data || []).filter((r) => !r.app || r.app === 'turista').map((r) => r.user_id).filter(Boolean))
      const { data: us } = await supabase.from('users').select('id').eq('user_type', 'tourist')
      userIds = (us || []).map((u) => u.id).filter((id) => tur.has(id))
    } else if (audience === 'with_booking' || audience === 'no_booking') {
      const { data: us } = await supabase.from('users').select('id').eq('user_type', 'tourist')
      const todos = (us || []).map((u) => u.id)
      const { data: bk } = await supabase.from('bookings').select('user_id')
      const comReserva = new Set((bk || []).map((b) => b.user_id).filter(Boolean))
      userIds = todos.filter((id) => audience === 'with_booking' ? comReserva.has(id) : !comReserva.has(id))
    } else {
      const { data: us } = await supabase.from('users').select('id').eq('user_type', 'tourist')
      userIds = (us || []).map((u) => u.id)
    }

    // Push só no PWA do destino escolhido.
    const onlyApps = [target]
    // Fire-and-forget em lotes pequenos para não travar a resposta.
    let enviados = 0
    for (const uid of userIds) { notifyUser({ userId: uid, title, body, onlyApps, image, url }); enviados += 1 }
    // Registra no histórico (best-effort; ignora se a migração 093 não rodou).
    supabase.from('notification_broadcasts')
      .insert({ title, body, audience: `${target}:${audience}`, sent_count: enviados, created_by: req.user.id })
      .then(() => {}, () => {})
    res.json({ ok: true, alvo: enviados })
  } catch (err) {
    console.error('[notifications] broadcast falhou:', err.message)
    res.status(500).json({ error: 'Falha ao enviar' })
  }
})

// ── GET /api/notifications/broadcasts (admin) — histórico dos últimos envios ──
router.get('/broadcasts', authenticate, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('notification_broadcasts')
      .select('id, title, body, audience, sent_count, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) throw error
    res.json(data || [])
  } catch {
    res.json([]) // tabela ausente → lista vazia
  }
})

export default router
