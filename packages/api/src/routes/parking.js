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
import { cobrarCartaoEConfirmar, cobrarExtensaoEAplicar } from '../services/parking/payments.js'
import { registrarEntrada, abrirRetirada, consumirRetirada } from '../services/parking/entry.js'

const router = Router()

const novoCodigo = () => `PK${Date.now().toString(36).toUpperCase().slice(-6)}`
const ehAdmin = (u) => u?.user_type === 'admin'

// true se o usuário é dono do lot (ou admin). Usado nas ações do parceiro.
async function podeOperarLot(user, lotId) {
  if (ehAdmin(user)) return true
  const { data: lot } = await supabase.from('parking_lots').select('owner_user_id').eq('id', lotId).maybeSingle()
  return lot?.owner_user_id === user.id
}

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
    const COLS = 'id, code, lot_id, vehicle_type, plate, start_at, end_at, units, total_amount, status, payment_status, entry_code, entered_at, completed_at, acceptance_expires_at, payment_deadline_at, created_at'
    // Tenta embutir se a reserva já foi avaliada (migration 111); tolera ausência.
    let { data, error } = await supabase
      .from('parking_reservations')
      .select(`${COLS}, parking_reviews(rating)`)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
    if (error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST200')) {
      ;({ data, error } = await supabase.from('parking_reservations').select(COLS)
        .eq('user_id', req.user.id).order('created_at', { ascending: false }))
    }
    if (error) throw error
    const out = (data || []).map(({ parking_reviews, completed_at, ...r }) => ({
      ...r, completed_at,
      reviewed: Array.isArray(parking_reviews) ? parking_reviews.length > 0 : undefined,
    }))
    res.json({ data: out })
  } catch (err) { next(err) }
})

// Lots do PARCEIRO (para selecionar no balcão de entrada/retirada).
router.get('/partner/lots', authenticate, async (req, res, next) => {
  try {
    let q = supabase.from('parking_lots').select('id, name, capacity, is_active').order('name')
    if (!ehAdmin(req.user)) q = q.eq('owner_user_id', req.user.id)
    const { data, error } = await q
    if (error) throw error
    res.json({ data: data || [] })
  } catch (err) { next(err) }
})

// Financeiro do PARCEIRO: apuração das reservas PAGAS por período.
// Bruto = total cobrado; comissão da plataforma = commission_pct (fotografado na
// reserva); líquido = bruto − comissão. Cálculo sempre no servidor (centavos),
// nunca no navegador. NÃO transfere dinheiro — é só apuração/relatório.
router.get('/partner/financial', authenticate, async (req, res, next) => {
  try {
    let lotIds = null
    if (!ehAdmin(req.user)) {
      const { data: lots } = await supabase.from('parking_lots').select('id').eq('owner_user_id', req.user.id)
      lotIds = (lots || []).map((l) => l.id)
      if (lotIds.length === 0) return res.json({ resumo: { bruto: 0, comissao: 0, liquido: 0, qtd: 0 }, por_lot: [], periodo: {} })
    }
    const from = req.query.from ? new Date(req.query.from).toISOString() : null
    const to   = req.query.to   ? new Date(req.query.to).toISOString()   : null

    let q = supabase.from('parking_reservations')
      .select('lot_id, total_amount, commission_pct, status, created_at')
      .eq('payment_status', 'paid')
    if (lotIds) q = q.in('lot_id', lotIds)
    if (from) q = q.gte('created_at', from)
    if (to)   q = q.lte('created_at', to)
    const { data, error } = await q
    if (error) throw error

    // Tudo em centavos para evitar erro de ponto flutuante; devolve em reais.
    const emCent = (v) => Math.round(Number(v || 0) * 100)
    const porLot = new Map()
    let brutoC = 0, comissaoC = 0
    for (const r of data || []) {
      const b = emCent(r.total_amount)
      const c = Math.round(b * Number(r.commission_pct || 0) / 100)
      brutoC += b; comissaoC += c
      const acc = porLot.get(r.lot_id) || { lot_id: r.lot_id, brutoC: 0, comissaoC: 0, qtd: 0 }
      acc.brutoC += b; acc.comissaoC += c; acc.qtd += 1
      porLot.set(r.lot_id, acc)
    }
    const reais = (c) => Math.round(c) / 100

    // Nome do lot para o relatório (sem dados bancários — mascarados por padrão).
    const ids = [...porLot.keys()]
    let nomes = {}
    if (ids.length) {
      const { data: lots } = await supabase.from('parking_lots').select('id, name').in('id', ids)
      nomes = Object.fromEntries((lots || []).map((l) => [l.id, l.name]))
    }

    res.json({
      resumo: { bruto: reais(brutoC), comissao: reais(comissaoC), liquido: reais(brutoC - comissaoC), qtd: (data || []).length },
      por_lot: [...porLot.values()].map((a) => ({
        lot_id: a.lot_id, name: nomes[a.lot_id] || '—', qtd: a.qtd,
        bruto: reais(a.brutoC), comissao: reais(a.comissaoC), liquido: reais(a.brutoC - a.comissaoC),
      })),
      periodo: { from, to },
    })
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
    if (data?.ok) {
      // Avisa o cliente que pode pagar (melhor-esforço; não derruba o aceite).
      try {
        const { notifyUser } = await import('../services/notify.js')
        const { data: r } = await supabase.from('parking_reservations')
          .select('user_id, code').eq('id', req.params.id).maybeSingle()
        if (r?.user_id) {
          await notifyUser({
            userId: r.user_id, templateKey: 'parking_accepted',
            title: 'Vaga aceita! Pague para confirmar ✅',
            body: `O estacionamento aceitou sua reserva (${r.code}). Pague agora para garantir a vaga.`,
          })
        }
      } catch { /* notificação é opcional */ }
    }
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

// ── Extensão de estadia (fase 8) ─────────────────────────────────────────────
// Prévia da diferença de preço para prorrogar até new_end_at. O preço é sempre
// recalculado no servidor para a janela [start_at, new_end_at).
const extendQuoteSchema = z.object({ new_end_at: z.string().datetime({ offset: true }) })
router.post('/reservations/:id/extend/quote', authenticate, async (req, res, next) => {
  try {
    const parsed = extendQuoteSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Informe o novo horário de saída.' })
    const { data: r } = await supabase.from('parking_reservations')
      .select('id, user_id, lot_id, vehicle_type, start_at, end_at, total_amount, status, payment_status').eq('id', req.params.id).maybeSingle()
    if (!r || r.user_id !== req.user.id) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (!['confirmed', 'in_lot'].includes(r.status) || r.payment_status !== 'paid') {
      return res.status(409).json({ error: 'Só dá para estender uma reserva confirmada.' })
    }
    if (Date.parse(parsed.data.new_end_at) <= Date.parse(r.end_at)) {
      return res.status(400).json({ error: 'O novo horário precisa ser depois do atual.' })
    }
    const cot = await cotarComTarifa({ lotId: r.lot_id, vehicleType: r.vehicle_type, startMs: Date.parse(r.start_at), endMs: Date.parse(parsed.data.new_end_at) })
    const delta = Math.max(0, Math.round((cot.total - Number(r.total_amount)) * 100) / 100)
    res.json({ new_total: cot.total, units: cot.diarias, delta, atual: Number(r.total_amount) })
  } catch (err) {
    if (err?.status === 422) return res.status(422).json({ error: err.message })
    next(err)
  }
})

// Estende de fato: recalcula, cobra a diferença (se houver) e aplica atômico.
const extendSchema = z.object({
  new_end_at:      z.string().datetime({ offset: true }),
  card_token:      z.string().min(1).optional(),
  parcelas:        z.number().int().min(1).max(12).optional(),
  idempotency_key: z.string().min(8).max(100),
})
router.post('/reservations/:id/extend', authenticate, async (req, res, next) => {
  try {
    const parsed = extendSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos para a extensão.' })
    const { data: r } = await supabase.from('parking_reservations')
      .select('id, code, user_id, lot_id, vehicle_type, start_at, end_at, total_amount, status, payment_status').eq('id', req.params.id).maybeSingle()
    if (!r || r.user_id !== req.user.id) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (!['confirmed', 'in_lot'].includes(r.status) || r.payment_status !== 'paid') {
      return res.status(409).json({ error: 'Só dá para estender uma reserva confirmada.' })
    }
    if (Date.parse(parsed.data.new_end_at) <= Date.parse(r.end_at)) {
      return res.status(400).json({ error: 'O novo horário precisa ser depois do atual.' })
    }

    const cot = await cotarComTarifa({ lotId: r.lot_id, vehicleType: r.vehicle_type, startMs: Date.parse(r.start_at), endMs: Date.parse(parsed.data.new_end_at) })
    const delta = Math.round((cot.total - Number(r.total_amount)) * 100) / 100
    if (delta > 0 && !parsed.data.card_token) {
      return res.status(400).json({ error: 'Pagamento necessário para estender.', delta })
    }

    const { data: cliente } = await supabase.from('users')
      .select('full_name, email, document_number, phone').eq('id', req.user.id).maybeSingle()

    const resultado = await cobrarExtensaoEAplicar({
      reserva: r, cliente,
      novo: { end_at: parsed.data.new_end_at, units: cot.diarias, total: cot.total },
      cardToken: parsed.data.card_token, parcelas: parsed.data.parcelas || 1, idempotencyKey: parsed.data.idempotency_key,
    })
    if (resultado.estado !== 'approved') {
      return res.status(402).json({ error: resultado.motivo || 'Pagamento não aprovado.', estado: resultado.estado })
    }
    if (!resultado.ok && resultado.no_capacity) {
      return res.status(409).json({ error: 'Sem vaga para o período estendido. Se foi cobrado, processaremos o estorno.', refund_pending: delta > 0 })
    }
    res.json({ ok: true, new_end_at: parsed.data.new_end_at, new_total: cot.total, delta: Math.max(0, delta) })
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// ── Avaliação (fase 8) ───────────────────────────────────────────────────────
// Resumo público do lot (média + total). Sem dados de quem avaliou.
router.get('/lots/:id/reviews', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('parking_reviews')
      .select('rating, comment, created_at').eq('lot_id', req.params.id)
      .order('created_at', { ascending: false }).limit(20)
    if (error) throw error
    const notas = (data || []).map((r) => r.rating)
    const media = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null
    res.json({ media, total: notas.length, ultimas: data || [] })
  } catch (err) { next(err) }
})

// Avaliar — DONO da reserva, só concluída, uma única vez (UNIQUE na reserva).
const reviewSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().nullable(),
})
router.post('/reservations/:id/review', authenticate, async (req, res, next) => {
  try {
    const parsed = reviewSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Informe uma nota de 1 a 5.' })
    const { data: r } = await supabase.from('parking_reservations')
      .select('id, user_id, lot_id, status').eq('id', req.params.id).maybeSingle()
    if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (r.user_id !== req.user.id) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (r.status !== 'completed') return res.status(409).json({ error: 'Você só avalia depois de concluir a estadia.' })
    const { error } = await supabase.from('parking_reviews').insert({
      reservation_id: r.id, lot_id: r.lot_id, user_id: req.user.id,
      rating: parsed.data.rating, comment: parsed.data.comment || null,
    })
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Esta reserva já foi avaliada.' })
      throw error
    }
    res.status(201).json({ ok: true })
  } catch (err) { next(err) }
})

// ── Pátio: entrada e retirada (fase 7) ───────────────────────────────────────
// Entrada por CÓDIGO (não-secreto) — parceiro/admin do lot. Atômico na função.
const entrySchema = z.object({
  lot_id: z.string().uuid(),
  code:   z.string().min(4).max(12),
  spot:   z.string().max(20).optional().nullable(),
  plate:  z.string().max(12).optional().nullable(),
})
router.post('/partner/entry', authenticate, async (req, res, next) => {
  try {
    const parsed = entrySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos para registrar entrada.' })
    if (!(await podeOperarLot(req.user, parsed.data.lot_id))) {
      return res.status(403).json({ error: 'Este estacionamento não é seu.' })
    }
    const data = await registrarEntrada({
      lotId: parsed.data.lot_id, code: parsed.data.code, actorId: req.user.id,
      spot: parsed.data.spot, plate: parsed.data.plate,
    })
    if (!data?.ok) {
      const map = { not_found: 404, bad_state: 409 }
      const msg = {
        not_found: 'Código não encontrado neste estacionamento.',
        bad_state: 'Esta reserva não está confirmada/paga para dar entrada.',
      }[data?.error] || 'Não foi possível registrar a entrada.'
      return res.status(map[data?.error] || 400).json({ error: msg })
    }
    res.json({ ok: true, already: !!data.already, code: data.code })
  } catch (err) { next(err) }
})

// Pedir retirada — DONO da reserva. Gera o PIN de uso único e o devolve UMA vez
// (só aqui; nunca relido do banco, nunca enviado ao parceiro/log/push/URL).
router.post('/reservations/:id/withdrawal', authenticate, async (req, res, next) => {
  try {
    const { data: r } = await supabase.from('parking_reservations')
      .select('id, user_id, lot_id, status').eq('id', req.params.id).maybeSingle()
    if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (r.user_id !== req.user.id) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (!['in_lot', 'withdrawal_requested'].includes(r.status)) {
      return res.status(409).json({ error: 'A retirada só está disponível com o veículo no pátio.' })
    }
    const { data: lot } = await supabase.from('parking_lots').select('pin_ttl_min').eq('id', r.lot_id).maybeSingle()
    const { pin, expires_at } = await abrirRetirada({ reservationId: r.id, ttlMin: lot?.pin_ttl_min || 5 })
    if (r.status !== 'withdrawal_requested') {
      await supabase.from('parking_reservations')
        .update({ status: 'withdrawal_requested', updated_at: new Date().toISOString() }).eq('id', r.id)
    }
    // O PIN sai só nesta resposta ao dono. Não logar.
    res.json({ ok: true, pin, expires_at })
  } catch (err) { next(err) }
})

// Validar retirada pelo PIN — parceiro/admin do lot. Consome atômico + conclui.
const withdrawSchema = z.object({
  lot_id: z.string().uuid(),
  pin:    z.string().min(4).max(10),
})
router.post('/partner/withdrawal', authenticate, async (req, res, next) => {
  try {
    const parsed = withdrawSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Informe o PIN de retirada.' })
    if (!(await podeOperarLot(req.user, parsed.data.lot_id))) {
      return res.status(403).json({ error: 'Este estacionamento não é seu.' })
    }
    const data = await consumirRetirada({ lotId: parsed.data.lot_id, pin: parsed.data.pin, actorId: req.user.id })
    if (!data?.ok) {
      const map = { invalid_pin: 422, expired: 410, bad_state: 409 }
      const msg = {
        invalid_pin: 'PIN inválido. Confira com o cliente.',
        expired: 'Este PIN expirou. Peça ao cliente para gerar um novo.',
        bad_state: 'Esta reserva não está no pátio para retirada.',
      }[data?.error] || 'Não foi possível validar a retirada.'
      return res.status(map[data?.error] || 400).json({ error: msg })
    }
    res.json({ ok: true, code: data.code })
  } catch (err) { next(err) }
})

export default router
