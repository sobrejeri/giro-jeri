// ── routes/parking.js — Estacionamento (Fase 2: API) ─────────────────────────
//
// Vertical própria. Cada reserva é uma SOLICITAÇÃO INDEPENDENTE: aceite,
// pagamento, prazos e cancelamento próprios (sem combo/conjunto). O cliente
// solicita sem pagar; o parceiro aceita (cria bloqueio de capacidade atômico);
// o pagamento (fase 4) só abre depois do aceite.
//
// Preço e disponibilidade são decididos no SERVIDOR; o navegador só informa
// lot, período e veículo. Transições de estado são explícitas — nada de PATCH
// genérico trocando status à vontade.

import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../supabase.js'
import { authenticate } from '../middleware/auth.js'
import { cotarComTarifa } from '../services/parking/pricing.js'
import { temVaga, blocoDe } from '../services/parking/capacity.js'
import { cobrarCartaoEConfirmar } from '../services/parking/payments.js'

const router = Router()

const novoCodigo = () => `PK${Date.now().toString(36).toUpperCase().slice(-6)}`
const ehAdmin = (u) => u?.user_type === 'admin'

// Campos públicos do catálogo (sem dados de cliente/placa/equipe).
const LOT_PUBLIC = 'id, name, description, photos, region_id, lat, lng, timezone, opening_hours, capacity, is_active, created_at'

// ── Catálogo ─────────────────────────────────────────────────────────────────
router.get('/lots', authenticate, async (req, res, next) => {
  try {
    let q = supabase.from('parking_lots').select(LOT_PUBLIC).eq('is_active', true).order('created_at', { ascending: false })
    if (req.query.region_id) q = q.eq('region_id', req.query.region_id)
    const { data, error } = await q
    if (error) throw error
    res.json({ data: data || [] })
  } catch (err) { next(err) }
})

router.get('/lots/:id', authenticate, async (req, res, next) => {
  try {
    const { data: lot, error } = await supabase.from('parking_lots').select(LOT_PUBLIC).eq('id', req.params.id).maybeSingle()
    if (error) throw error
    if (!lot || !lot.is_active) return res.status(404).json({ error: 'Estacionamento não encontrado.' })
    const { data: tarifas } = await supabase
      .from('parking_tariffs')
      .select('vehicle_type, price_per_unit, unit, hours_per_unit, min_units')
      .eq('lot_id', lot.id).eq('is_active', true)
    res.json({ ...lot, tariffs: tarifas || [] })
  } catch (err) { next(err) }
})

// ── Cotação (sem reservar nada) ──────────────────────────────────────────────
const quoteSchema = z.object({
  lot_id:       z.string().uuid(),
  vehicle_type: z.string().min(1),
  start_at:     z.string().datetime({ offset: true }),
  end_at:       z.string().datetime({ offset: true }),
})

async function cotarEDisponibilidade({ lot_id, vehicle_type, start_at, end_at }) {
  const startMs = Date.parse(start_at)
  const endMs   = Date.parse(end_at)
  const cot = await cotarComTarifa({ lotId: lot_id, vehicleType: vehicle_type, startMs, endMs })

  // Disponibilidade INDICATIVA (não é um hold): pico de ocupação no intervalo.
  const { data: lot } = await supabase.from('parking_lots').select('capacity').eq('id', lot_id).maybeSingle()
  const { data: blocksRaw } = await supabase
    .from('parking_capacity_blocks')
    .select('start_at, end_at, qty, kind, expires_at')
    .eq('lot_id', lot_id).eq('status', 'active')
    .lt('start_at', end_at).gt('end_at', start_at)
  const agora = Date.now()
  const blocks = (blocksRaw || [])
    .filter((b) => b.kind !== 'temp_hold' || !b.expires_at || new Date(b.expires_at).getTime() > agora)
    .map((b) => blocoDe(b))
  const disp = temVaga({ capacidade: lot?.capacity ?? 0, blocks, start: startMs, end: endMs, want: 1 })
  return { cot, disp: { disponivel: Math.max(0, disp.disponivel), tem_vaga: disp.cabe } }
}

router.post('/quote', authenticate, async (req, res, next) => {
  try {
    const parsed = quoteSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos para cotação.' })
    if (Date.parse(parsed.data.end_at) <= Date.parse(parsed.data.start_at)) {
      return res.status(400).json({ error: 'A saída precisa ser depois da entrada.' })
    }
    const { cot, disp } = await cotarEDisponibilidade(parsed.data)
    res.json({
      diarias: cot.diarias, unit_price: cot.unit_price, total: cot.total,
      disponibilidade: disp, policy_snapshot: cot.policy_snapshot,
    })
  } catch (err) {
    if (err?.status === 422) return res.status(422).json({ error: err.message })
    next(err)
  }
})

// ── Criar solicitação (cliente, sem pagar, sem bloquear vaga) ────────────────
const createSchema = quoteSchema.extend({
  plate:     z.string().max(12).optional().nullable(),
  batch_ref: z.string().max(64).optional().nullable(),
})

router.post('/reservations', authenticate, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos para a solicitação.' })
    const { lot_id, vehicle_type, start_at, end_at, plate, batch_ref } = parsed.data
    if (Date.parse(end_at) <= Date.parse(start_at)) {
      return res.status(400).json({ error: 'A saída precisa ser depois da entrada.' })
    }

    const { data: lot } = await supabase.from('parking_lots')
      .select('id, is_active, commission_pct, accept_deadline_min').eq('id', lot_id).maybeSingle()
    if (!lot || !lot.is_active) return res.status(404).json({ error: 'Estacionamento indisponível.' })

    // Preço SEMPRE recalculado no servidor (ignora qualquer valor do cliente).
    const cot = await cotarComTarifa({ lotId: lot_id, vehicleType: vehicle_type, startMs: Date.parse(start_at), endMs: Date.parse(end_at) })

    const acceptanceExpires = new Date(Date.now() + lot.accept_deadline_min * 60_000).toISOString()
    const { data: reserva, error } = await supabase
      .from('parking_reservations')
      .insert({
        code: novoCodigo(),
        user_id: req.user.id,
        lot_id,
        vehicle_type,
        plate: plate || null,
        start_at, end_at,
        units: cot.diarias,
        unit_price: cot.unit_price,
        total_amount: cot.total,
        commission_pct: lot.commission_pct,
        policy_snapshot: cot.policy_snapshot,
        status: 'awaiting_partner',
        payment_status: 'none',
        batch_ref: batch_ref || null,
        acceptance_expires_at: acceptanceExpires,
      })
      .select('id, code, status, total_amount, start_at, end_at, acceptance_expires_at')
      .single()
    if (error) throw error
    res.status(201).json(reserva)
  } catch (err) {
    if (err?.status === 422) return res.status(422).json({ error: err.message })
    next(err)
  }
})

// ── Listas ───────────────────────────────────────────────────────────────────
// Reservas do CLIENTE (as próprias).
router.get('/reservations', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('parking_reservations')
      .select('id, code, lot_id, vehicle_type, plate, start_at, end_at, units, total_amount, status, payment_status, acceptance_expires_at, payment_deadline_at, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json({ data: data || [] })
  } catch (err) { next(err) }
})

// Fila do PARCEIRO: solicitações dos lots que ele é dono (admin vê todos).
router.get('/partner/reservations', authenticate, async (req, res, next) => {
  try {
    let lotIds = null
    if (!ehAdmin(req.user)) {
      const { data: lots } = await supabase.from('parking_lots').select('id').eq('owner_user_id', req.user.id)
      lotIds = (lots || []).map((l) => l.id)
      if (lotIds.length === 0) return res.json({ data: [] })
    }
    let q = supabase.from('parking_reservations')
      .select('id, code, lot_id, user_id, vehicle_type, plate, start_at, end_at, units, total_amount, status, payment_status, acceptance_expires_at, payment_deadline_at, created_at')
      .order('created_at', { ascending: false })
    if (req.query.status) q = q.eq('status', req.query.status)
    if (lotIds) q = q.in('lot_id', lotIds)
    const { data, error } = await q
    if (error) throw error
    res.json({ data: data || [] })
  } catch (err) { next(err) }
})

// Detalhe — dono, parceiro do lot ou admin.
router.get('/reservations/:id', authenticate, async (req, res, next) => {
  try {
    const { data: r, error } = await supabase.from('parking_reservations').select('*').eq('id', req.params.id).maybeSingle()
    if (error) throw error
    if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
    const dono = r.user_id === req.user.id
    let parceiro = ehAdmin(req.user)
    if (!dono && !parceiro) {
      const { data: lot } = await supabase.from('parking_lots').select('owner_user_id').eq('id', r.lot_id).maybeSingle()
      parceiro = lot?.owner_user_id === req.user.id
    }
    if (!dono && !parceiro) return res.status(404).json({ error: 'Reserva não encontrada.' })
    res.json(r)
  } catch (err) { next(err) }
})

// ── Transições ───────────────────────────────────────────────────────────────
// Aceitar — parceiro/admin. Atômico via função SQL (anti-overbooking).
router.post('/reservations/:id/accept', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('parking_accept_reservation', {
      p_reservation_id: req.params.id,
      p_actor: req.user.id,
      p_is_admin: ehAdmin(req.user),
    })
    if (error) throw error
    if (!data?.ok) {
      const map = { not_found: 404, lot_not_found: 404, forbidden: 403, bad_state: 409, no_capacity: 409 }
      const code = map[data?.error] || 400
      const msg = {
        not_found: 'Reserva não encontrada.', forbidden: 'Esta reserva não é do seu estacionamento.',
        bad_state: 'Esta solicitação não está mais aguardando aceite.',
        no_capacity: 'Sem vaga disponível para o período solicitado.',
      }[data?.error] || 'Não foi possível aceitar.'
      return res.status(code).json({ error: msg })
    }
    res.json({ ok: true, payment_deadline_at: data.payment_deadline_at })
  } catch (err) { next(err) }
})

// Recusar — parceiro/admin. Encerra só esta solicitação.
router.post('/reservations/:id/reject', authenticate, async (req, res, next) => {
  try {
    const { data: r } = await supabase.from('parking_reservations').select('id, lot_id, status').eq('id', req.params.id).maybeSingle()
    if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (!ehAdmin(req.user)) {
      const { data: lot } = await supabase.from('parking_lots').select('owner_user_id').eq('id', r.lot_id).maybeSingle()
      if (lot?.owner_user_id !== req.user.id) return res.status(403).json({ error: 'Esta reserva não é do seu estacionamento.' })
    }
    if (r.status !== 'awaiting_partner') return res.status(409).json({ error: 'Só dá para recusar enquanto aguarda aceite.' })
    const { error } = await supabase.from('parking_reservations')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', r.id).eq('status', 'awaiting_partner')
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Pagar — dono da reserva. Só depois do aceite e dentro do prazo. Cobra no
// cartão (Pagar.me) e confirma atomicamente. O valor é SEMPRE o da reserva
// (fotografado no aceite) — o cliente não decide o valor.
const paySchema = z.object({
  card_token:      z.string().min(1),
  parcelas:        z.number().int().min(1).max(12).optional(),
  idempotency_key: z.string().min(8).max(100),
})
router.post('/reservations/:id/pay', authenticate, async (req, res, next) => {
  try {
    const parsed = paySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados de pagamento inválidos.' })

    const { data: r } = await supabase.from('parking_reservations')
      .select('id, code, user_id, status, payment_status, total_amount, payment_deadline_at')
      .eq('id', req.params.id).maybeSingle()
    if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (r.user_id !== req.user.id) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (r.payment_status === 'paid' || ['confirmed', 'in_lot', 'completed'].includes(r.status)) {
      return res.json({ ok: true, already: true })
    }
    if (r.status !== 'accepted_awaiting_payment') {
      return res.status(409).json({ error: 'Esta reserva ainda não está liberada para pagamento.' })
    }
    if (r.payment_deadline_at && new Date(r.payment_deadline_at).getTime() <= Date.now()) {
      return res.status(409).json({ error: 'O prazo de pagamento expirou. Solicite novamente.' })
    }

    const { data: cliente } = await supabase.from('users')
      .select('full_name, email, document_number, phone').eq('id', req.user.id).maybeSingle()

    const resultado = await cobrarCartaoEConfirmar({
      reserva: r, cliente, cardToken: parsed.data.card_token,
      parcelas: parsed.data.parcelas || 1, idempotencyKey: parsed.data.idempotency_key,
    })

    if (resultado.estado !== 'approved') {
      return res.status(402).json({ error: resultado.motivo || 'Pagamento não aprovado.', estado: resultado.estado })
    }
    if (!resultado.ok && resultado.no_capacity) {
      // Pagou, mas a vaga foi comprometida: pagamento registrado, encaminhar estorno.
      return res.status(409).json({
        error: 'O pagamento foi recebido, mas a vaga não está mais disponível. Vamos processar o estorno.',
        refund_pending: true,
      })
    }
    res.json({ ok: true, confirmed: true })
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Cancelar — dono (ou admin). Libera bloqueios de capacidade de forma idempotente.
router.post('/reservations/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { data: r } = await supabase.from('parking_reservations').select('id, user_id, status').eq('id', req.params.id).maybeSingle()
    if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (r.user_id !== req.user.id && !ehAdmin(req.user)) return res.status(404).json({ error: 'Reserva não encontrada.' })
    const CANCELAVEL = ['awaiting_partner', 'accepted_awaiting_payment', 'confirmed']
    if (!CANCELAVEL.includes(r.status)) return res.status(409).json({ error: 'Esta reserva não pode ser cancelada agora.' })
    // Libera holds/bloqueios da reserva (idempotente).
    await supabase.from('parking_capacity_blocks')
      .update({ status: 'released' }).eq('reservation_id', r.id).eq('status', 'active')
    const { error } = await supabase.from('parking_reservations')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
