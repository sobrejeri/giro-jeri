// ── notify.js ──────────────────────────────────────────
// Cria notificações na central do app (tabela `notifications`) e dispara
// Web Push quando disponível (Fase 2). Fire-and-forget: nunca derruba o
// fluxo que a chamou (pagamento, aceite, etc.).
//
// Usa apenas colunas que já existem na tabela base, então funciona mesmo
// antes da migração 021 ser aplicada (a migração só habilita o "lido" e o
// push). O envio de Web Push só acontece se VAPID estiver configurado.

import { supabase } from '../supabase.js'

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
export async function notifyUser({ userId, bookingId = null, templateKey = null, title, body }) {
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
  firePush(userId, { title: title || 'Turiva', body, bookingId, templateKey })
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
