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

// Data (YYYY-MM-DD) de hoje e amanhã em Fortaleza — para buscar as reservas
// cujo serviço acontece nas próximas horas sem varrer o histórico todo.
function datasProximas() {
  const { yyyy, mm, dd } = fortaleza()
  const hoje = `${yyyy}-${mm}-${dd}`
  const d = new Date(`${hoje}T12:00:00-03:00`)
  d.setDate(d.getDate() + 1)
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return [hoje, p]
}

// Lembrete "o serviço está próximo": avisa o CLIENTE e o OPERADOR quando faltam
// até ~2h para a execução. Roda de hora em hora; a janela de 2h + o dedupe por
// reserva garantem 1 aviso por reserva, sem depender de service_datetime (que
// tem fuso ambíguo) — o horário é montado de service_date+service_time em
// America/Fortaleza (UTC−3, sem horário de verão).
const JANELA_AVISO = 2 * HORA
async function runServiceReminders() {
  const tpl = await getTemplate('service_soon')
  if (!tpl?.enabled) return
  const agora = Date.now()
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, user_id, operator_id, booking_code, service_type, service_date, service_time, status_operational')
    .eq('status_commercial', 'paid')
    .in('service_date', datasProximas())
  for (const b of bookings || []) {
    if (!b.service_time) continue
    if (['completed', 'cancelled'].includes(b.status_operational)) continue
    const alvo = new Date(`${b.service_date}T${String(b.service_time).slice(0, 5)}:00-03:00`).getTime()
    if (isNaN(alvo)) continue
    const diff = alvo - agora
    if (diff <= 0 || diff > JANELA_AVISO) continue

    const hhmm  = String(b.service_time).slice(0, 5)
    const label = b.service_type === 'tour' ? 'passeio' : 'transfer'

    // Cliente
    if (b.user_id && await claim(b.user_id, 'service_soon', b.id)) {
      await notifyUser({
        userId: b.user_id, bookingId: b.id, templateKey: 'service_soon',
        title: 'Seu serviço começa em breve ⏰',
        body: `Seu ${label} (${b.booking_code}) começa às ${hhmm}. Prepare-se!`,
      })
    }
    // Operador atribuído (kind separado para não colidir com o dedupe do cliente)
    if (b.operator_id && await claim(b.operator_id, 'service_soon_op', b.id)) {
      await notifyUser({
        userId: b.operator_id, bookingId: b.id, templateKey: 'service_soon',
        title: 'Serviço em breve ⏰',
        body: `${label === 'passeio' ? 'Passeio' : 'Transfer'} ${b.booking_code} às ${hhmm}. Prepare o embarque.`,
      })
    }
  }
}

async function tick() {
  try { await runServiceReminders() } catch (e) { console.error('[scheduler] service-soon:', e.message) }
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
