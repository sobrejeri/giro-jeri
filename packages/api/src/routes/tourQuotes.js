// ── tourQuotes.js — PASSEIO PERSONALIZADO (cotação) ──────────────────────────
//
// Mesmo fluxo do translado personalizado (transfers.js → /quotes), mas para
// passeios: o cliente monta o roteiro (ponto de partida + paradas) + veículo +
// data/hora/pessoas, SEM preço, e envia. O operador precifica, o cliente aceita
// e paga, e a cotação vira uma reserva normal (service_type='tour', privativo)
// que segue o fluxo padrão (despacho, início, conclusão, pin de embarque…).
// Reaproveita o enum quote_status (migração 002) e a tabela tour_quotes (125).

import { Router } from 'express'
import { z }      from 'zod'
import { supabase } from '../supabase.js'
import { authenticate, requireOperator } from '../middleware/auth.js'
import { notifyUser, notifyOperatorsAndAdmin } from '../services/notify.js'
import { notifyOperatorsNewTourQuote, notifyClientTourQuoteReady } from '../services/whatsapp.js'
import dayjs from 'dayjs'

const router = Router()

// Paradas do roteiro: nome obrigatório; coordenadas opcionais (quando o cliente
// escolhe um lugar do mapa).
const stopSchema = z.object({
  name: z.string().min(1).max(300),
  lat:  z.number().optional().nullable(),
  lng:  z.number().optional().nullable(),
})

const createSchema = z.object({
  region_id:         z.string().uuid(),
  origin_place_name: z.string().min(2).max(300),
  origin_latitude:   z.number().optional().nullable(),
  origin_longitude:  z.number().optional().nullable(),
  stops:             z.array(stopSchema).max(20).optional().default([]),
  vehicle_type:      z.string().max(80).optional().nullable(),
  service_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  service_time:      z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido (HH:MM)'),
  people_count:      z.number({ coerce: true }).int().min(1).max(200),
  special_notes:     z.string().max(2000).optional().nullable(),
})

// Roteiro em texto (ponto de partida → paradas) para notificações e para o
// destination_text da reserva (o motorista/operador vê para onde é o passeio).
function roteiroTexto(q) {
  const paradas = Array.isArray(q?.stops) ? q.stops.map((s) => s?.name).filter(Boolean) : []
  return [q?.origin_place_name, ...paradas].filter(Boolean).join(' → ')
}

// Esconde o contato do cliente até a cotação virar reserva PAGA (igual translado:
// evita combinar por fora antes de a plataforma fechar o negócio).
function esconderContato(linhas) {
  return (linhas || []).map((q) => {
    if (q.status === 'accepted' && q.booking_id) return q
    const { client_phone, client_name, client_email, ...resto } = q
    return { ...resto, customer_locked: true }
  })
}

// ── POST /api/tour-quotes — cliente pede a cotação (SEM preço) ────────────────
router.post('/', authenticate, async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body)
    if (dayjs(`${body.service_date}T${body.service_time}`).isBefore(dayjs())) {
      return res.status(400).json({ error: 'A data e o horário do passeio já passaram. Escolha outro.' })
    }
    const { data, error } = await supabase
      .from('tour_quotes')
      .insert({ ...body, user_id: req.user.id, source_channel: 'app', status: 'pending_quote' })
      .select()
      .single()
    if (error) throw error

    // Central do app — operadores de rua (buggy/4x4) + admin. Mesmo corte do
    // translado personalizado (fleetModalSlug 'terrestre').
    await notifyOperatorsAndAdmin({
      fleetModalSlug: 'terrestre',
      templateKey:    'new_transfer_quote',
      title:          'Nova cotação de passeio',
      body:           `${req.user.full_name} pediu um passeio personalizado: ${roteiroTexto(data)} em ${dayjs(body.service_date).format('DD/MM')} às ${body.service_time}. Abra para cotar.`,
    })
    // WhatsApp pras operadores (fire-and-forget).
    notifyOperatorsNewTourQuote(supabase, data).catch((err) =>
      console.error('[whatsapp] cotação de passeio falhou:', err.message))

    res.status(201).json(data)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors })
    next(err)
  }
})

// ── GET /api/tour-quotes — cliente vê suas cotações ──────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('tour_quotes').select('*').eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) { next(err) }
})

// ── GET /api/tour-quotes/pending — fila do operador ──────────────────────────
router.get('/pending', authenticate, requireOperator, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('v_tour_quotes_dashboard').select('*')
      .order('is_urgent', { ascending: false }).order('service_date')
    if (error) throw error
    res.json(esconderContato(data))
  } catch (err) { next(err) }
})

// ── PATCH /api/tour-quotes/:id/quote — operador define o PREÇO ────────────────
router.patch('/:id/quote', authenticate, requireOperator, async (req, res, next) => {
  try {
    const quoted_price = Number(req.body.quoted_price)
    const quote_notes  = req.body.quote_notes ?? req.body.operator_notes ?? null
    if (!quoted_price || quoted_price <= 0) return res.status(400).json({ error: 'Informe um preço válido' })

    const { data: existing } = await supabase
      .from('tour_quotes').select('id, status').eq('id', req.params.id).maybeSingle()
    if (!existing) return res.status(404).json({ error: `Cotação ${req.params.id} não encontrada` })
    if (existing.status !== 'pending_quote') return res.status(409).json({ error: 'Esta cotação já foi respondida. Atualize a lista.' })

    const { data: setting } = await supabase
      .from('system_settings').select('setting_value').eq('setting_key', 'quote_expiry_hours').maybeSingle()
    const expiryHours = parseInt(setting?.setting_value || '2')
    const expiresAt   = dayjs().add(expiryHours, 'hour').toISOString()

    const { data, error } = await supabase
      .from('tour_quotes')
      .update({ quoted_price, quote_notes, status: 'quoted', quoted_by_user_id: req.user.id, quoted_at: new Date().toISOString(), expires_at: expiresAt })
      .eq('id', req.params.id).eq('status', 'pending_quote').select('*').single()
    if (error) return res.status(500).json({ error: error.message })
    if (!data)  return res.status(409).json({ error: 'Cotação já respondida por outro operador.' })

    notifyUser({
      userId: data.user_id, templateKey: 'quote_ready', title: 'Sua cotação de passeio está pronta 💸',
      body: `Seu passeio ${roteiroTexto(data)} saiu por R$ ${quoted_price.toFixed(2)}. Abra o app para aceitar (válido por ${expiryHours}h).`,
    })
    notifyClientTourQuoteReady(supabase, data).catch((err) =>
      console.error('[whatsapp] aviso cliente cotação de passeio falhou:', err.message))

    res.json(data)
  } catch (err) { next(err) }
})

// ── POST /api/tour-quotes/:id/accept — cliente aceita → vira RESERVA ─────────
router.post('/:id/accept', authenticate, async (req, res, next) => {
  try {
    const { data: quote, error } = await supabase
      .from('tour_quotes').select('*').eq('id', req.params.id).eq('user_id', req.user.id).eq('status', 'quoted').single()
    if (error || !quote) return res.status(404).json({ error: 'Cotação não encontrada ou não disponível' })

    if (quote.expires_at && dayjs().isAfter(dayjs(quote.expires_at))) {
      await supabase.from('tour_quotes').update({ status: 'expired' }).eq('id', quote.id)
      return res.status(400).json({ error: 'Esta cotação expirou. Solicite uma nova.' })
    }

    await supabase.from('tour_quotes')
      .update({ status: 'accepted', client_responded_at: new Date().toISOString() }).eq('id', quote.id)

    // Reserva já atribuída ao operador que cotou (preço e prestador negociados).
    const bookingCode = `GJ${Date.now().toString(36).toUpperCase().slice(-6)}`
    const notes = [quote.vehicle_type ? `Veículo: ${quote.vehicle_type}` : null, quote.special_notes].filter(Boolean).join(' · ') || null
    const baseBooking = {
      booking_code:       bookingCode,
      user_id:            req.user.id,
      region_id:          quote.region_id,
      service_type:       'tour',
      service_id:         quote.id,
      operator_id:        quote.quoted_by_user_id,
      booking_mode:       'private',
      service_date:       quote.service_date,
      service_time:       quote.service_time,
      people_count:       quote.people_count,
      origin_text:        quote.origin_place_name,
      destination_text:   roteiroTexto(quote),
      // Coordenadas do embarque → pin de localização do motorista/turista.
      pickup_latitude:    quote.origin_latitude ?? null,
      pickup_longitude:   quote.origin_longitude ?? null,
      pickup_place_name:  quote.origin_place_name || null,
      special_notes:      notes,
      total_amount:       quote.quoted_price,
      status_commercial:  'awaiting_payment',
      status_operational: 'assigned',
      payment_status:     'pending',
    }
    let { data: booking, error: bErr } = await supabase
      .from('bookings')
      .insert({ ...baseBooking, acceptance_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
      .select('id, booking_code')
      .single()
    if (bErr?.code === '42703') {
      const retry = await supabase.from('bookings').insert(baseBooking).select('id, booking_code').single()
      booking = retry.data; bErr = retry.error
    }
    if (bErr) throw bErr

    await supabase.from('tour_quotes').update({ booking_id: booking.id }).eq('id', quote.id)

    res.json({
      message:      'Cotação aceita! Prossiga para o pagamento.',
      quoted_price: quote.quoted_price,
      quote_id:     quote.id,
      booking_id:   booking.id,
      booking_code: booking.booking_code,
    })
  } catch (err) { next(err) }
})

// ── POST /api/tour-quotes/:id/reject — cliente recusa o preço ────────────────
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const { rejection_reason } = req.body
    const { data, error } = await supabase
      .from('tour_quotes')
      .update({ status: 'rejected', rejection_reason, client_responded_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('user_id', req.user.id).eq('status', 'quoted').select().single()
    if (error || !data) return res.status(404).json({ error: 'Cotação não encontrada' })
    res.json({ message: 'Cotação recusada.' })
  } catch (err) { next(err) }
})

// ── POST /api/tour-quotes/:id/cancel — cliente cancela (qualquer estado ativo) ─
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('tour_quotes')
      .update({ status: 'cancelled', client_responded_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('user_id', req.user.id).in('status', ['pending_quote', 'quoted', 'accepted'])
      .select('id, booking_id').single()
    if (error || !data) return res.status(404).json({ error: 'Cotação não encontrada ou já finalizada' })
    // Cancela em cascata a reserva gerada (se já criada e ainda não paga).
    if (data.booking_id) {
      await supabase.from('bookings')
        .update({ status_commercial: 'cancelled', status_operational: 'cancelled' })
        .eq('id', data.booking_id).eq('status_commercial', 'awaiting_payment')
    }
    res.json({ message: 'Solicitação cancelada.' })
  } catch (err) { next(err) }
})

export default router
