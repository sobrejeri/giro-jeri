// ── notify.js ──────────────────────────────────────────
// Cria notificações na central do app (tabela `notifications`) e dispara
// Web Push quando disponível (Fase 2). Fire-and-forget: nunca derruba o
// fluxo que a chamou (pagamento, aceite, etc.).
//
// Usa apenas colunas que já existem na tabela base, então funciona mesmo
// antes da migração 021 ser aplicada (a migração só habilita o "lido" e o
// push). O envio de Web Push só acontece se VAPID estiver configurado.

import { supabase } from '../supabase.js'

// Textos padrão das notificações automáticas — usados como fallback caso a
// tabela notification_templates ainda não exista (migração 092 não aplicada).
export const DEFAULT_TEMPLATES = {
  welcome:       { enabled: true, title: 'Bem-vindo(a) à Turiva! 🌴', body: 'Sua conta está pronta. Explore passeios e transfers em Jericoacoara e viva momentos inesquecíveis.' },
  birthday:      { enabled: true, title: 'Feliz aniversário! 🎉',      body: 'A Turiva deseja um dia incrível! Que tal comemorar com um passeio em Jeri?' },
  cart_reminder: { enabled: true, title: 'Sua reserva está esperando 🛒', body: 'Você tem uma reserva aguardando pagamento. Conclua antes que a vaga seja liberada!' },
  cart_pending:  { enabled: true, title: 'Você deixou itens no carrinho 🛒', body: 'Volte e finalize sua solicitação em Jericoacoara — é rápido e sua reserva fica garantida!' },
  // Avisos internos do admin (estilo Hotmart) — os textos abaixo são só o
  // fallback; a mensagem real é montada com os dados do evento no código.
  admin_new_user:          { enabled: true, title: 'Novo cadastro 👤',        body: 'Um novo usuário acabou de criar conta na Turiva.' },
  admin_payment_approved:  { enabled: true, title: 'Recebimento aprovado 💰', body: 'Um pagamento foi aprovado.' },
  admin_payment_rejected:  { enabled: true, title: 'Pagamento recusado ⚠️',   body: 'Uma tentativa de pagamento foi recusada.' },
}

// Lê um modelo do banco; se a tabela não existir ou não houver linha, cai no
// padrão. Nunca lança.
export async function getTemplate(key) {
  try {
    const { data } = await supabase
      .from('notification_templates')
      .select('enabled, title, body')
      .eq('key', key)
      .maybeSingle()
    if (data) return data
  } catch { /* tabela ausente → fallback */ }
  return DEFAULT_TEMPLATES[key] || null
}

// Importa o sender de Web Push de forma preguiçosa e tolerante: se o módulo
// ou a dependência não existir ainda (Fase 1), vira no-op silencioso.
let _pushFn = null
let _pushTried = false
async function getPushSender() {
  if (_pushTried) return _pushFn
  _pushTried = true
  try {
    const mod = await import('./webpush.js')
    _pushFn = mod.sendPushToUser || null
  } catch {
    _pushFn = null
  }
  return _pushFn
}

async function firePush(userId, payload) {
  try {
    const send = await getPushSender()
    if (send) await send(userId, payload)
  } catch (err) {
    console.error('[notify] web push falhou (ignorado):', err.message)
  }
}

// Notifica UM usuário (turista, em geral).
export async function notifyUser({ userId, bookingId = null, templateKey = null, title, body, onlyApps = null, image = null, url = null }) {
  if (!userId || !body) return
  try {
    await supabase.from('notifications').insert({
      user_id:      userId,
      booking_id:   bookingId,
      channel:      'internal',
      template_key: templateKey,
      title:        title || 'Turiva',
      message_body: body,
      send_status:  'sent',
      sent_at:      new Date().toISOString(),
    })
  } catch (err) {
    console.error('[notify] insert (user) falhou:', err.message)
  }
  firePush(userId, { title: title || 'Turiva', body, bookingId, templateKey, onlyApps, image, url })
}

// Notifica TODOS os turistas (ex.: nova publicação/story). Fire-and-forget;
// push só no app do turista (onlyApps). Nunca lança.
export async function notifyTourists({ title, body, image = null, url = null, templateKey = null }) {
  if (!body) return
  try {
    const { data } = await supabase.from('users').select('id').eq('user_type', 'tourist')
    for (const u of data || []) {
      notifyUser({ userId: u.id, title, body, image, url, templateKey, onlyApps: ['turista'] })
    }
  } catch (err) {
    console.error('[notify] tourists falhou:', err.message)
  }
}

// Notifica só os ADMINs ativos (avisos internos: novo cadastro, recebimento
// aprovado/recusado). Respeita o toggle "ativa/desativada" do modelo no admin.
export async function notifyAdmins({ bookingId = null, templateKey = null, title, body }) {
  if (!body) return
  try {
    // Se houver um modelo com este key desligado no admin, não dispara nada.
    if (templateKey) {
      const tpl = await getTemplate(templateKey)
      if (tpl && tpl.enabled === false) return
    }
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('user_type', 'admin')
      .eq('is_active', true)
    const admins = data || []
    if (!admins.length) return

    const now = new Date().toISOString()
    const rows = admins.map((a) => ({
      user_id:      a.id,
      booking_id:   bookingId,
      channel:      'internal',
      template_key: templateKey,
      title:        title || 'Turiva',
      message_body: body,
      send_status:  'sent',
      sent_at:      now,
    }))
    await supabase.from('notifications').insert(rows)
    // Push SÓ no PWA do admin — não no aparelho do mesmo usuário logado no
    // app do turista/operador.
    for (const a of admins) firePush(a.id, { title: title || 'Turiva', body, bookingId, templateKey, onlyApps: ['admin'] })
  } catch (err) {
    console.error('[notify] insert (admins) falhou:', err.message)
  }
}

// Notifica TODAS os operadores ativos + admins (ex.: nova solicitação).
export async function notifyOperatorsAndAdmin({ bookingId = null, templateKey = null, title, body, fleetBookingId = null, fleetModalSlug = null }) {
  if (!body) return
  try {
    let recipients
    if (fleetModalSlug) {
      // Cotação personalizada: nasce sem veículo, então o corte é o MODAL.
      // Sem isto ela caía no `else` abaixo e ia para TODO operador ativo —
      // a que só voa recebia pedido de translado de rua.
      const { eligibleOperatorsForModal } = await import('./fleet.js')
      const [ops, adminsRes] = await Promise.all([
        eligibleOperatorsForModal(supabase, fleetModalSlug),
        supabase.from('users').select('id').eq('user_type', 'admin').eq('is_active', true),
      ])
      recipients = [...(ops || []).map((o) => ({ id: o.id })), ...(adminsRes.data || [])]
    } else if (fleetBookingId) {
      // Item 17: solicitação nova → só as coops com frota compatível + admins.
      const { eligibleOperatorsForBooking } = await import('./fleet.js')
      const [ops, adminsRes] = await Promise.all([
        eligibleOperatorsForBooking(supabase, fleetBookingId),
        supabase.from('users').select('id').eq('user_type', 'admin').eq('is_active', true),
      ])
      recipients = [...(ops || []).map((o) => ({ id: o.id })), ...(adminsRes.data || [])]
    } else {
      const { data } = await supabase
        .from('users')
        .select('id')
        .in('user_type', ['operator', 'admin'])
        .eq('is_active', true)
      recipients = data
    }

    if (!recipients?.length) return

    const now = new Date().toISOString()
    const rows = recipients.map((r) => ({
      user_id:      r.id,
      booking_id:   bookingId,
      channel:      'internal',
      template_key: templateKey,
      title:        title || 'Turiva',
      message_body: body,
      send_status:  'sent',
      sent_at:      now,
    }))

    await supabase.from('notifications').insert(rows)
    for (const r of recipients) firePush(r.id, { title: title || 'Turiva', body, bookingId, templateKey })
  } catch (err) {
    console.error('[notify] insert (operators/admin) falhou:', err.message)
  }
}
