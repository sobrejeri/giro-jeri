// ── mpOauth.js ─────────────────────────────────────────
// OAuth do Mercado Pago para o split de pagamentos (marketplace).
// O operador conecta a própria conta MP; guardamos os tokens para criar os
// pagamentos NA conta dela com a comissão da plataforma (application_fee).
import { Router } from 'express'
import crypto     from 'node:crypto'
import { supabase } from '../supabase.js'
import { authenticate, requireOperator } from '../middleware/auth.js'
import {
  isMarketplaceConfigured, buildOAuthAuthorizeUrl, exchangeOAuthCode,
} from '../services/mercadoPago.js'

const router = Router()

// Segredo para assinar o `state` do OAuth (anti-CSRF e identifica o operador).
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
// Para onde o operador volta depois de autorizar (tela de Perfil do app dela).
const returnUrl   = () => (process.env.MP_OAUTH_RETURN_URL || process.env.COOP_URL || '').replace(/\/$/, '')

// ── GET /api/mp/connect-url ────────────────────────────
// Devolve a URL de autorização do Mercado Pago para o operador logado.
router.get('/connect-url', authenticate, requireOperator, (req, res) => {
  const missing = []
  if (!process.env.MP_CLIENT_ID && !process.env.MP_MARKETPLACE_CLIENT_ID)         missing.push('MP_CLIENT_ID')
  if (!process.env.MP_CLIENT_SECRET && !process.env.MP_MARKETPLACE_CLIENT_SECRET) missing.push('MP_CLIENT_SECRET')
  if (!apiBase())                                                                  missing.push('RENDER_EXTERNAL_URL ou API_BASE_URL')
  if (missing.length) {
    return res.status(503).json({
      error:   `Configuração de marketplace incompleta no servidor. Faltando: ${missing.join(', ')}.`,
      missing,
    })
  }
  const url = buildOAuthAuthorizeUrl({ redirectUri: redirectUri(), state: signState(req.user.id) })
  res.json({ url, redirect_uri: redirectUri() })
})

// ── GET /api/mp/diag ────────────────────────────────────
// Diagnóstico público (sem token) — só diz quais envs do OAuth marketplace
// estão presentes, sem expor valores. Útil pra debugar "aplicativo não pronto".
router.get('/diag', (_req, res) => {
  res.json({
    marketplace_configured: isMarketplaceConfigured(),
    has_client_id:          !!(process.env.MP_CLIENT_ID || process.env.MP_MARKETPLACE_CLIENT_ID),
    has_client_secret:      !!(process.env.MP_CLIENT_SECRET || process.env.MP_MARKETPLACE_CLIENT_SECRET),
    has_access_token:       !!(process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN),
    api_base:               apiBase() || null,
    redirect_uri:           apiBase() ? redirectUri() : null,
    return_url:             returnUrl() || null,
  })
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
// no operador identificada pelo `state`. No fim, volta para o app dela.
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
