// ── mpOauth.js ─────────────────────────────────────────
// OAuth do Mercado Pago para o split de pagamentos (marketplace).
// A cooperativa conecta a própria conta MP; guardamos os tokens para criar os
// pagamentos NA conta dela com a comissão da plataforma (application_fee).
import { Router } from 'express'
import crypto     from 'node:crypto'
import { supabase } from '../supabase.js'
import { authenticate, requireOperator } from '../middleware/auth.js'
import {
  isMarketplaceConfigured, buildOAuthAuthorizeUrl, exchangeOAuthCode,
} from '../services/mercadoPago.js'

const router = Router()

// Segredo para assinar o `state` do OAuth (anti-CSRF e identifica a cooperativa).
const STATE_SECRET = process.env.MP_OAUTH_STATE_SECRET
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || 'giro-jeri-mp-oauth-state'

function signState(operatorId) {
  const payload = Buffer.from(JSON.stringify({ op: operatorId, exp: Date.now() + 15 * 60 * 1000 })).toString('base64url')
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyState(state) {
  if (!state || !state.includes('.')) return null
  const [payload, sig] = state.split('.')
  const expected = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('base64url')
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch { return null }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data.exp || data.exp < Date.now()) return null
    return data.op
  } catch { return null }
}

const apiBase     = () => (process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || '').replace(/\/$/, '')
const redirectUri = () => `${apiBase()}/api/mp/callback`
// Para onde a cooperativa volta depois de autorizar (tela de Perfil do app dela).
const returnUrl   = () => (process.env.MP_OAUTH_RETURN_URL || process.env.COOP_URL || '').replace(/\/$/, '')

// ── GET /api/mp/connect-url ────────────────────────────
// Devolve a URL de autorização do Mercado Pago para a cooperativa logada.
router.get('/connect-url', authenticate, requireOperator, (req, res) => {
  if (!isMarketplaceConfigured()) {
    return res.status(503).json({ error: 'Pagamento via Mercado Pago ainda não foi habilitado pelo administrador.' })
  }
  if (!apiBase()) {
    return res.status(503).json({ error: 'URL pública da API não configurada (RENDER_EXTERNAL_URL/API_BASE_URL).' })
  }
  const url = buildOAuthAuthorizeUrl({ redirectUri: redirectUri(), state: signState(req.user.id) })
  res.json({ url })
})

// ── GET /api/mp/status ─────────────────────────────────
router.get('/status', authenticate, requireOperator, async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('users')
      .select('mp_user_id, mp_connected_at')
      .eq('id', req.user.id)
      .single()
    res.json({
      configured:   isMarketplaceConfigured(),
      connected:    !!data?.mp_user_id,
      mp_user_id:   data?.mp_user_id || null,
      connected_at: data?.mp_connected_at || null,
    })
  } catch (err) { next(err) }
})

// ── POST /api/mp/disconnect ────────────────────────────
router.post('/disconnect', authenticate, requireOperator, async (req, res, next) => {
  try {
    await supabase.from('users').update({
      mp_user_id: null, mp_access_token: null, mp_refresh_token: null,
      mp_public_key: null, mp_token_expires_at: null, mp_connected_at: null,
    }).eq('id', req.user.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── GET /api/mp/callback ───────────────────────────────
// Redirecionamento do Mercado Pago (público). Troca o `code` por tokens e guarda
// na cooperativa identificada pelo `state`. No fim, volta para o app dela.
router.get('/callback', async (req, res) => {
  const dest = returnUrl()
  const back = (params) => res.redirect(`${dest}/perfil?${new URLSearchParams(params).toString()}`)

  try {
    const operatorId = verifyState(String(req.query.state || ''))
    if (!operatorId)      return back({ mp: 'erro', motivo: 'sessao' })
    if (!req.query.code)  return back({ mp: 'erro', motivo: 'sem_codigo' })

    const tok = await exchangeOAuthCode({ code: String(req.query.code), redirectUri: redirectUri() })
    const expiresAt = tok.expires_in
      ? new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString()
      : null

    await supabase.from('users').update({
      mp_user_id:          tok.user_id != null ? String(tok.user_id) : null,
      mp_access_token:     tok.access_token  || null,
      mp_refresh_token:    tok.refresh_token || null,
      mp_public_key:       tok.public_key    || null,
      mp_token_expires_at: expiresAt,
      mp_connected_at:     new Date().toISOString(),
    }).eq('id', operatorId)

    return back({ mp: 'connected' })
  } catch (err) {
    console.error('[mp/callback] falhou:', err.message)
    return back({ mp: 'erro' })
  }
})

export default router
