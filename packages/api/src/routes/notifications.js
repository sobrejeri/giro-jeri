import { Router }       from 'express'
import { supabase }     from '../supabase.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { isWhatsappEnabled, sendTestMessage } from '../services/whatsapp.js'

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
router.get('/', authenticate, async (req, res) => {
  // Caminho normal (após a migração 021, com a coluna read_at)
  const withRead = await supabase
    .from('notifications')
    .select('id, title, message_body, template_key, booking_id, read_at, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  if (!withRead.error) {
    const items = withRead.data || []
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
  const items = (basic.data || []).map((n) => ({ ...n, read_at: '1970-01-01T00:00:00Z' }))
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
    const { endpoint, keys } = req.body || {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Inscrição de push inválida' })
    }
    await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id:    req.user.id,
          endpoint,
          p256dh:     keys.p256dh,
          auth:       keys.auth,
          user_agent: req.headers['user-agent'] || null,
        },
        { onConflict: 'user_id,endpoint' },
      )
    res.json({ ok: true })
  } catch (err) {
    console.error('[notifications] push-subscribe falhou:', err.message)
    res.status(500).json({ error: 'Falha ao salvar inscrição de push' })
  }
})

export default router
