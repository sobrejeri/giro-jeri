import { Router }       from 'express'
import { supabase }     from '../supabase.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

// ── GET /api/notifications — minhas notificações + total não lidas ──
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, message_body, template_key, booking_id, read_at, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) throw error

    const items  = data || []
    const unread = items.filter((n) => !n.read_at).length
    res.json({ items, unread })
  } catch (err) {
    // Antes da migração 021 (coluna read_at ausente), degrada para vazio
    // em vez de quebrar a central.
    console.error('[notifications] list falhou:', err.message)
    res.json({ items: [], unread: 0 })
  }
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
