// ── notificationScheduler.js ───────────────────────────────────────────────
// Agendador interno (sem serviço externo) para as notificações automáticas que
// dependem de horário: aniversário (1x/ano) e lembrete de reserva aguardando
// pagamento (1x/reserva). Roda ao subir e de hora em hora. O dedupe é pela
// tabela notification_sends (UNIQUE user_id+kind+ref): "reservamos" a linha
// ANTES de enviar, então nunca duplica, mesmo com reinícios.
//
// Antes da migração 092 a tabela não existe → o insert falha e nada é enviado
// (comportamento seguro, sem erro fatal).

import { supabase } from '../supabase.js'
import { notifyUser, getTemplate } from './notify.js'

const HORA = 60 * 60 * 1000

// Data/hora em America/Fortaleza (mesmo fuso das regras do app).
function fortaleza() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const g = (t) => p.find((x) => x.type === t)?.value
  return { yyyy: g('year'), mm: g('month'), dd: g('day'), hour: Number(g('hour')) }
}

// Reserva a linha de dedupe; true = ainda não enviado (pode enviar agora).
async function claim(userId, kind, ref) {
  const { error } = await supabase
    .from('notification_sends')
    .insert({ user_id: userId, kind, ref: String(ref) })
  return !error // erro (inclui UNIQUE 23505 e tabela ausente) → não envia
}

async function runBirthdays() {
  const tpl = await getTemplate('birthday')
  if (!tpl?.enabled) return
  const { yyyy, mm, dd } = fortaleza()
  const { data: users } = await supabase
    .from('users').select('id, birth_date').not('birth_date', 'is', null)
  for (const u of users || []) {
    if (String(u.birth_date).slice(5, 10) !== `${mm}-${dd}`) continue
    if (!(await claim(u.id, 'birthday', yyyy))) continue
    await notifyUser({ userId: u.id, templateKey: 'birthday', title: tpl.title, body: tpl.body })
  }
}

async function runCartReminders() {
  const tpl = await getTemplate('cart_reminder')
  if (!tpl?.enabled) return
  const agora = Date.now()
  const min = new Date(agora - 48 * HORA).toISOString() // não incomoda reservas muito antigas
  const max = new Date(agora - 3 * HORA).toISOString()  // espera 3h antes de lembrar
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, user_id, created_at')
    .eq('status_commercial', 'awaiting_payment')
    .gte('created_at', min).lte('created_at', max)
  for (const b of bookings || []) {
    if (!b.user_id) continue
    if (!(await claim(b.user_id, 'cart_reminder', b.id))) continue
    await notifyUser({ userId: b.user_id, bookingId: b.id, templateKey: 'cart_reminder', title: tpl.title, body: tpl.body })
  }
}

// Carrinho montado mas NÃO solicitado (097): o app manda um snapshot leve
// enquanto há itens; ao solicitar/esvaziar, o snapshot vai a 0. Lembra quem
// deixou o carrinho parado por 3h+, no máximo 1x por "abandono" (reminded_at).
// Uma nova mexida no carrinho zera o reminded_at (a rota faz isso) e reabre a
// janela, então quem volta e some de novo é lembrado outra vez.
async function runCartPending() {
  const tpl = await getTemplate('cart_pending')
  if (!tpl?.enabled) return
  const agora = Date.now()
  const min = new Date(agora - 72 * HORA).toISOString() // ignora carrinhos velhos
  const max = new Date(agora - 3 * HORA).toISOString()  // espera 3h de inatividade
  const { data: carts } = await supabase
    .from('cart_snapshots')
    .select('user_id, item_count, updated_at, reminded_at')
    .gt('item_count', 0)
    .lte('updated_at', max)
    .gte('updated_at', min)
    .is('reminded_at', null)
  for (const c of carts || []) {
    if (!c.user_id) continue
    // Trava o lembrete ANTES de enviar (condição no reminded_at nulo) para não
    // duplicar entre ticks/reinícios concorrentes.
    const { data: claimed } = await supabase
      .from('cart_snapshots')
      .update({ reminded_at: new Date().toISOString() })
      .eq('user_id', c.user_id)
      .is('reminded_at', null)
      .gt('item_count', 0)
      .select('user_id')
      .maybeSingle()
    if (!claimed) continue
    await notifyUser({ userId: c.user_id, templateKey: 'cart_pending', title: tpl.title, body: tpl.body })
  }
}

async function tick() {
  try { await runCartReminders() } catch (e) { console.error('[scheduler] cart:', e.message) }
  try { await runCartPending() } catch (e) { console.error('[scheduler] cart-pending:', e.message) }
  try {
    // Aniversário uma vez ao dia, por volta das 9h (Fortaleza); o dedupe por
    // ano garante 1x mesmo se o horário casar em ticks seguidos.
    if (fortaleza().hour === 9) await runBirthdays()
  } catch (e) { console.error('[scheduler] birthday:', e.message) }
}

export function startNotificationScheduler() {
  setTimeout(tick, 30_000)   // logo após subir
  setInterval(tick, HORA)    // e de hora em hora
  console.log('[scheduler] notificações automáticas ativas (hora em hora)')
}
