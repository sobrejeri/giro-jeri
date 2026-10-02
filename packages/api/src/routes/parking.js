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
    // Inclui address (migration 117) de forma tolerante — se a coluna não existe,
    // cai no conjunto público sem address.
    let { data: lot, error } = await supabase.from('parking_lots')
      .select(`${LOT_PUBLIC}, address, overstay_fee_cents, overstay_fee_unit, overstay_grace_min`)
      .eq('id', req.params.id).maybeSingle()
    if (error && error.code === '42703') ({ data: lot, error } = await supabase.from('parking_lots').select(LOT_PUBLIC).eq('id', req.params.id).maybeSingle())
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
    // Embute nome/foto do estacionamento e flag de avaliação; tolera ausência.
    const mk = (sel) => supabase.from('parking_reservations').select(sel).eq('user_id', req.user.id).order('created_at', { ascending: false })
    let { data, error } = await mk(`${COLS}, parking_lots(name, photos), parking_reviews(rating)`)
    if (error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST200')) {
      ;({ data, error } = await mk(`${COLS}, parking_lots(name, photos)`))
      if (error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST200')) ({ data, error } = await mk(COLS))
    }
    if (error) throw error
    const out = (data || []).map(({ parking_reviews, parking_lots, completed_at, ...r }) => ({
      ...r, completed_at,
      lot_name: parking_lots?.name || null,
      lot_photo: Array.isArray(parking_lots?.photos) ? parking_lots.photos[0] : null,
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

    const SEL = 'id, code, lot_id, user_id, total_amount, commission_pct, status, completed_at, created_at'
    const mk = (withJoin) => {
      let q = supabase.from('parking_reservations').select(withJoin ? `${SEL}, users(full_name)` : SEL).eq('payment_status', 'paid')
      if (lotIds) q = q.in('lot_id', lotIds)
      if (from) q = q.gte('created_at', from)
      if (to) q = q.lte('created_at', to)
      return q.order('created_at', { ascending: false }).limit(200)
    }
    let { data, error } = await mk(true)
    if (error && (error.code === '42703' || error.code === 'PGRST200' || error.code === 'PGRST204')) ({ data, error } = await mk(false))
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

    // Itens por reserva + status de repasse derivado do ciclo (sem pagar de fato):
    // 'a_liberar' = estadia concluída; 'em_curso' = paga mas ainda não concluída.
    const itens = (data || []).map(({ users, ...r }) => {
      const b = emCent(r.total_amount), c = Math.round(b * Number(r.commission_pct || 0) / 100)
      return {
        id: r.id, code: r.code, user_name: users?.full_name || null, status: r.status,
        bruto: reais(b), comissao: reais(c), liquido: reais(b - c),
        repasse: r.status === 'completed' ? 'a_liberar' : 'em_curso', completed_at: r.completed_at,
      }
    })

    res.json({
      resumo: { bruto: reais(brutoC), comissao: reais(comissaoC), liquido: reais(brutoC - comissaoC), qtd: (data || []).length },
      por_lot: [...porLot.values()].map((a) => ({
        lot_id: a.lot_id, name: nomes[a.lot_id] || '—', qtd: a.qtd,
        bruto: reais(a.brutoC), comissao: reais(a.comissaoC), liquido: reais(a.brutoC - a.comissaoC),
      })),
      itens, periodo: { from, to },
    })
  } catch (err) { next(err) }
})

// Resolve os lots do parceiro (ou todos, se admin).
async function lotsDoParceiro(user) {
  if (ehAdmin(user)) {
    const { data } = await supabase.from('parking_lots').select('id, name, capacity')
    return data || []
  }
  const { data } = await supabase.from('parking_lots').select('id, name, capacity').eq('owner_user_id', user.id)
  return data || []
}

// ── Início: visão geral do parceiro (dashboard) ───────────────────────────────
router.get('/partner/overview', authenticate, async (req, res, next) => {
  try {
    const lots = await lotsDoParceiro(req.user)
    if (lots.length === 0) return res.json({ lot: null, stats: { no_patio: 0, capacity: 0, livres: 0, entradas_hoje: 0, saidas_hoje: 0 } })
    const lotIds = lots.map((l) => l.id)
    const capacity = lots.reduce((a, l) => a + Number(l.capacity || 0), 0)

    // Janela de "hoje" em Fortaleza (−03:00).
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' })
    const diaIni = `${hoje}T00:00:00-03:00`, diaFim = `${hoje}T23:59:59-03:00`

    const [patio, entradas, saidasRes, saidasStay] = await Promise.all([
      supabase.from('parking_stays').select('id', { count: 'exact', head: true }).in('lot_id', lotIds).is('exited_at', null),
      supabase.from('parking_reservations').select('id', { count: 'exact', head: true }).in('lot_id', lotIds).eq('status', 'confirmed').gte('start_at', diaIni).lte('start_at', diaFim),
      supabase.from('parking_reservations').select('id', { count: 'exact', head: true }).in('lot_id', lotIds).eq('status', 'in_lot').gte('end_at', diaIni).lte('end_at', diaFim),
      supabase.from('parking_stays').select('id', { count: 'exact', head: true }).in('lot_id', lotIds).is('exited_at', null).gte('expected_exit_at', diaIni).lte('expected_exit_at', diaFim),
    ])
    const noPatio = patio.count || 0
    res.json({
      lot: lots[0],
      stats: {
        no_patio: noPatio, capacity, livres: Math.max(0, capacity - noPatio),
        entradas_hoje: entradas.count || 0,
        saidas_hoje: (saidasRes.count || 0) + (saidasStay.count || 0),
      },
    })
  } catch (err) { next(err) }
})

// ── Pátio: veículos presentes + saídas de hoje ────────────────────────────────
router.get('/partner/patio', authenticate, async (req, res, next) => {
  try {
    const lots = await lotsDoParceiro(req.user)
    if (lots.length === 0) return res.json({ no_patio: [], saidas_hoje: [] })
    const lotIds = lots.map((l) => l.id)
    const COLS = 'id, lot_id, reservation_id, origin, plate, spot, vehicle_type, client_name, entered_at, exited_at, expected_exit_at, amount, payment_status'
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' })
    const diaIni = `${hoje}T00:00:00-03:00`, diaFim = `${hoje}T23:59:59-03:00`

    let abertos = await supabase.from('parking_stays').select(COLS).in('lot_id', lotIds).is('exited_at', null).order('entered_at', { ascending: false })
    if (abertos.error && (abertos.error.code === '42703')) {
      abertos = await supabase.from('parking_stays').select('id, lot_id, reservation_id, origin, plate, spot, entered_at, exited_at').in('lot_id', lotIds).is('exited_at', null)
    }
    const { data: saidas } = await supabase.from('parking_stays').select(COLS).in('lot_id', lotIds).gte('exited_at', diaIni).lte('exited_at', diaFim).order('exited_at', { ascending: false })
    res.json({ no_patio: abertos.data || [], saidas_hoje: saidas || [] })
  } catch (err) { next(err) }
})

// ── Entrada presencial (walk-in) cobrada pela plataforma ──────────────────────
const walkinSchema = z.object({
  lot_id:       z.string().uuid(),
  client_name:  z.string().min(2).max(120),
  client_phone: z.string().max(30).optional().nullable(),
  vehicle_type: z.string().min(1).max(40),
  plate:        z.string().max(12).optional().nullable(),
  spot:         z.string().max(20).optional().nullable(),
  start_at:     z.string().datetime({ offset: true }),
  end_at:       z.string().datetime({ offset: true }),
  amount:       z.number().min(0),
  payment_status: z.enum(['paid', 'pending']).optional(),
})
router.post('/partner/walkin', authenticate, async (req, res, next) => {
  try {
    const parsed = walkinSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados da entrada inválidos.' })
    const b = parsed.data
    if (!(await podeOperarLot(req.user, b.lot_id))) return res.status(403).json({ error: 'Este estacionamento não é seu.' })
    const { data: lot } = await supabase.from('parking_lots').select('commission_pct').eq('id', b.lot_id).maybeSingle()
    const { data, error } = await supabase.rpc('parking_create_walkin', {
      p_lot_id: b.lot_id, p_actor: req.user.id, p_client_name: b.client_name, p_client_phone: b.client_phone || null,
      p_vehicle_type: b.vehicle_type, p_plate: b.plate || null, p_spot: b.spot || null,
      p_start: b.start_at, p_end: b.end_at, p_amount: b.amount, p_commission_pct: lot?.commission_pct || 0,
      p_payment_status: b.payment_status || 'pending',
    })
    if (error) throw error
    if (!data?.ok) {
      const msg = { lot_not_found: 'Estacionamento não encontrado.', bad_window: 'Período inválido.', no_capacity: 'Sem vaga para o período.' }[data?.error] || 'Não foi possível registrar.'
      return res.status(data?.error === 'no_capacity' ? 409 : 400).json({ error: msg })
    }
    res.status(201).json({ ok: true, stay_id: data.stay_id })
  } catch (err) { next(err) }
})

// Marcar walk-in como pago (liquidação presencial — entra no repasse).
router.post('/partner/stays/:id/mark-paid', authenticate, async (req, res, next) => {
  try {
    const { data: s } = await supabase.from('parking_stays').select('id, lot_id').eq('id', req.params.id).maybeSingle()
    if (!s) return res.status(404).json({ error: 'Estadia não encontrada.' })
    if (!(await podeOperarLot(req.user, s.lot_id))) return res.status(403).json({ error: 'Não é seu estacionamento.' })
    const { error } = await supabase.from('parking_stays').update({ payment_status: 'paid' }).eq('id', s.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Registrar saída de um walk-in (sem PIN — é presencial). Libera a vaga.
router.post('/partner/stays/:id/exit', authenticate, async (req, res, next) => {
  try {
    const { data: s } = await supabase.from('parking_stays').select('id, lot_id, origin, capacity_block_id, exited_at').eq('id', req.params.id).maybeSingle()
    if (!s) return res.status(404).json({ error: 'Estadia não encontrada.' })
    if (!(await podeOperarLot(req.user, s.lot_id))) return res.status(403).json({ error: 'Não é seu estacionamento.' })
    if (s.exited_at) return res.json({ ok: true, already: true })
    if (s.capacity_block_id) {
      await supabase.from('parking_capacity_blocks').update({ status: 'released' }).eq('id', s.capacity_block_id)
    }
    const { error } = await supabase.from('parking_stays').update({ exited_at: new Date().toISOString(), exited_by: req.user.id }).eq('id', s.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Autoatendimento do parceiro (completa o próprio cadastro no painel) ───────
// O admin provisiona (login + lot casca); o parceiro preenche o resto aqui.
// Campos de PLATAFORMA (comissão, prazos, reembolso) não são editáveis pelo
// parceiro — ficam só no admin.
router.get('/partner/my-lots', authenticate, async (req, res, next) => {
  try {
    let q = supabase.from('parking_lots')
      .select('*, parking_tariffs(id, vehicle_type, price_per_unit, hours_per_unit, min_units, is_active)')
      .order('created_at', { ascending: false })
    if (!ehAdmin(req.user)) q = q.eq('owner_user_id', req.user.id)
    const { data, error } = await q
    if (error) throw error
    res.json({ data: data || [] })
  } catch (err) { next(err) }
})

const partnerLotSchema = z.object({
  name:          z.string().min(2).max(120).optional(),
  description:   z.string().max(1000).optional().nullable(),
  address:       z.string().max(300).optional().nullable(),
  lat:           z.number().optional().nullable(),
  lng:           z.number().optional().nullable(),
  capacity:      z.number().int().min(0).optional(),
  opening_hours: z.record(z.any()).optional(),
  photos:        z.array(z.string().max(2048)).max(10).optional(),
  is_active:     z.boolean().optional(),
  // Taxa de excedente (atraso) — migration 118. Valor em centavos.
  overstay_fee_cents: z.number().int().min(0).optional(),
  overstay_fee_unit:  z.enum(['hour', 'day']).optional(),
  overstay_grace_min: z.number().int().min(0).max(1440).optional(),
})
// Colunas que podem não existir se a migration correspondente estiver pendente.
const COLUNAS_OPCIONAIS_LOT = ['address', 'overstay_fee_cents', 'overstay_fee_unit', 'overstay_grace_min']
router.patch('/partner/lots/:id', authenticate, async (req, res, next) => {
  try {
    if (!(await podeOperarLot(req.user, req.params.id))) return res.status(403).json({ error: 'Este estacionamento não é seu.' })
    const parsed = partnerLotSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' })
    const patch = { ...parsed.data, updated_at: new Date().toISOString() }
    let { error } = await supabase.from('parking_lots').update(patch).eq('id', req.params.id)
    // Tolera colunas ausentes (migrations 117/118 pendentes): remove as opcionais e retenta.
    if (error && error.code === '42703' && COLUNAS_OPCIONAIS_LOT.some((c) => c in patch)) {
      const rest = { ...patch }
      for (const c of COLUNAS_OPCIONAIS_LOT) delete rest[c]
      ;({ error } = await supabase.from('parking_lots').update(rest).eq('id', req.params.id))
    }
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
})

const partnerTariffSchema = z.object({
  vehicle_type:   z.string().min(1).max(40),
  price_per_unit: z.number().min(0),
  hours_per_unit: z.number().int().min(1).optional(),
  min_units:      z.number().int().min(1).optional(),
})
router.post('/partner/lots/:id/tariffs', authenticate, async (req, res, next) => {
  try {
    if (!(await podeOperarLot(req.user, req.params.id))) return res.status(403).json({ error: 'Este estacionamento não é seu.' })
    const parsed = partnerTariffSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados da tarifa inválidos.' })
    const { data, error } = await supabase.from('parking_tariffs')
      .insert({ lot_id: req.params.id, ...parsed.data }).select('id').single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { next(err) }
})
router.patch('/partner/tariffs/:id', authenticate, async (req, res, next) => {
  try {
    // Confere que a tarifa pertence a um lot do parceiro (ou admin).
    const { data: t } = await supabase.from('parking_tariffs').select('lot_id').eq('id', req.params.id).maybeSingle()
    if (!t) return res.status(404).json({ error: 'Tarifa não encontrada.' })
    if (!(await podeOperarLot(req.user, t.lot_id))) return res.status(403).json({ error: 'Esta tarifa não é sua.' })
    const parsed = partnerTariffSchema.partial().extend({ is_active: z.boolean().optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' })
    const { error } = await supabase.from('parking_tariffs').update(parsed.data).eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
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
    const COLS = 'id, code, lot_id, user_id, vehicle_type, plate, start_at, end_at, units, total_amount, commission_pct, status, payment_status, accepted_at, entered_at, completed_at, acceptance_expires_at, payment_deadline_at, created_at'
    const mk = (withJoin) => {
      let q = supabase.from('parking_reservations')
        .select(withJoin ? `${COLS}, users(full_name)` : COLS)
        .order('created_at', { ascending: false })
      if (req.query.status) q = q.eq('status', req.query.status)
      if (lotIds) q = q.in('lot_id', lotIds)
      return q
    }
    let { data, error } = await mk(true)
    if (error && (error.code === '42703' || error.code === 'PGRST200' || error.code === 'PGRST204')) {
      ;({ data, error } = await mk(false))
    }
    if (error) throw error
    const out = (data || []).map(({ users, ...r }) => ({ ...r, user_name: users?.full_name || null }))
    res.json({ data: out })
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

// Prévia da política de reembolso (antes de confirmar o cancelamento).
router.get('/reservations/:id/refund-preview', authenticate, async (req, res, next) => {
  try {
    const { data: r } = await supabase.from('parking_reservations')
      .select('id, user_id, lot_id, status, payment_status, total_amount, start_at').eq('id', req.params.id).maybeSingle()
    if (!r || (r.user_id !== req.user.id && !ehAdmin(req.user))) return res.status(404).json({ error: 'Reserva não encontrada.' })
    res.json(await avaliarReembolso(r))
  } catch (err) { next(err) }
})

// Avalia a elegibilidade de reembolso por ANTECEDÊNCIA (cutoff configurável por
// lot; sem número mágico). Não move dinheiro — só calcula.
async function avaliarReembolso(r) {
  if (r.payment_status !== 'paid') return { pago: false, elegivel: false, valor: 0 }
  const { data: lot } = await supabase.from('parking_lots').select('refund_cutoff_min').eq('id', r.lot_id).maybeSingle()
  const cutoffMin = Number(lot?.refund_cutoff_min ?? 1440)
  const limite = new Date(r.start_at).getTime() - cutoffMin * 60_000
  // Só reembolsa antes de entrar no pátio e dentro da janela de antecedência.
  const elegivel = r.status === 'confirmed' && Date.now() <= limite
  return { pago: true, elegivel, valor: elegivel ? Number(r.total_amount) : 0, cutoff_min: cutoffMin }
}

// Pagar com Pix — dono da reserva, pós-aceite, dentro do prazo. Gera o QR; a
// confirmação vem por webhook + polling (GET .../pix-status).
const payPixSchema = z.object({ email: z.string().email().optional() })
router.post('/reservations/:id/pay-pix', authenticate, async (req, res, next) => {
  try {
    const parsed = payPixSchema.safeParse(req.body || {})
    const { data: r } = await supabase.from('parking_reservations')
      .select('id, code, user_id, status, payment_status, total_amount, payment_deadline_at')
      .eq('id', req.params.id).maybeSingle()
    if (!r || r.user_id !== req.user.id) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (r.payment_status === 'paid' || ['confirmed', 'in_lot', 'completed'].includes(r.status)) return res.json({ ok: true, already: true })
    if (r.status !== 'accepted_awaiting_payment') return res.status(409).json({ error: 'Esta reserva ainda não está liberada para pagamento.' })
    if (r.payment_deadline_at && new Date(r.payment_deadline_at).getTime() <= Date.now()) return res.status(409).json({ error: 'O prazo de pagamento expirou. Solicite novamente.' })

    const { data: cliente } = await supabase.from('users').select('full_name, email, document_number').eq('id', req.user.id).maybeSingle()
    const { criarPixEstacionamento } = await import('../services/parking/pix.js')
    const pix = await criarPixEstacionamento({ reserva: r, cliente, email: parsed.success ? parsed.data.email : undefined })
    res.json({ ok: true, ...pix })
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Status do Pix (polling) — confirma se o MP já aprovou.
router.get('/reservations/:id/pix-status', authenticate, async (req, res, next) => {
  try {
    const { data: r } = await supabase.from('parking_reservations').select('id, user_id').eq('id', req.params.id).maybeSingle()
    if (!r || r.user_id !== req.user.id) return res.status(404).json({ error: 'Reserva não encontrada.' })
    const { conferirPix } = await import('../services/parking/pix.js')
    res.json(await conferirPix(req.params.id))
  } catch (err) { next(err) }
})

// Cancelar — dono (ou admin). Libera capacidade e aplica a política de reembolso
// por antecedência (registra elegibilidade/valor; o estorno é processado à parte).
router.post('/reservations/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { data: r } = await supabase.from('parking_reservations')
      .select('id, user_id, lot_id, code, status, payment_status, total_amount, start_at').eq('id', req.params.id).maybeSingle()
    if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (r.user_id !== req.user.id && !ehAdmin(req.user)) return res.status(404).json({ error: 'Reserva não encontrada.' })
    const CANCELAVEL = ['awaiting_partner', 'accepted_awaiting_payment', 'confirmed']
    if (!CANCELAVEL.includes(r.status)) return res.status(409).json({ error: 'Esta reserva não pode ser cancelada agora.' })

    const reembolso = await avaliarReembolso(r)

    // Libera holds/bloqueios da reserva (idempotente).
    await supabase.from('parking_capacity_blocks')
      .update({ status: 'released' }).eq('reservation_id', r.id).eq('status', 'active')

    const patch = { status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    if (reembolso.pago) { patch.refund_status = reembolso.elegivel ? 'eligible' : 'denied'; patch.refund_amount = reembolso.valor }
    let { error } = await supabase.from('parking_reservations').update(patch).eq('id', r.id)
    // Tolera ausência da migration 113 (colunas de reembolso).
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      ;({ error } = await supabase.from('parking_reservations')
        .update({ status: 'cancelled', cancelled_at: patch.cancelled_at, updated_at: patch.updated_at }).eq('id', r.id))
    }
    if (error) throw error
    res.json({ ok: true, refund: reembolso })
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

// ── Alteração de período com aprovação do operador (fase D) ───────────────────
// Cliente PEDE (sem pagar) → operador APROVA → cliente PAGA a diferença.
router.post('/reservations/:id/change-request', authenticate, async (req, res, next) => {
  try {
    const parsed = extendQuoteSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Informe o novo horário de saída.' })
    const { data: r } = await supabase.from('parking_reservations')
      .select('id, user_id, lot_id, code, vehicle_type, start_at, end_at, total_amount, status, payment_status').eq('id', req.params.id).maybeSingle()
    if (!r || r.user_id !== req.user.id) return res.status(404).json({ error: 'Reserva não encontrada.' })
    if (!['confirmed', 'in_lot'].includes(r.status) || r.payment_status !== 'paid') {
      return res.status(409).json({ error: 'Só dá para alterar uma reserva confirmada.' })
    }
    if (Date.parse(parsed.data.new_end_at) <= Date.parse(r.end_at)) {
      return res.status(400).json({ error: 'O novo horário precisa ser depois do atual.' })
    }
    const cot = await cotarComTarifa({ lotId: r.lot_id, vehicleType: r.vehicle_type, startMs: Date.parse(r.start_at), endMs: Date.parse(parsed.data.new_end_at) })
    const delta = Math.max(0, Math.round((cot.total - Number(r.total_amount)) * 100) / 100)
    const { data, error } = await supabase.from('parking_change_requests').insert({
      reservation_id: r.id, new_end_at: parsed.data.new_end_at, new_units: cot.diarias, new_total: cot.total, delta,
    }).select('id').single()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe um pedido de alteração em andamento.' })
      throw error
    }
    try {
      const { data: lot } = await supabase.from('parking_lots').select('owner_user_id').eq('id', r.lot_id).maybeSingle()
      const { notifyUser } = await import('../services/notify.js')
      if (lot?.owner_user_id) await notifyUser({ userId: lot.owner_user_id, templateKey: 'parking_change', title: 'Pedido de alteração de período', body: `Cliente pediu para estender a reserva ${r.code}. Analise no painel.` })
    } catch { /* opcional */ }
    res.status(201).json({ ok: true, id: data.id, delta, new_total: cot.total })
  } catch (err) {
    if (err?.status === 422) return res.status(422).json({ error: err.message })
    next(err)
  }
})

// Alteração ativa de uma reserva (para o cliente acompanhar/pagar).
router.get('/reservations/:id/change', authenticate, async (req, res, next) => {
  try {
    const { data: r } = await supabase.from('parking_reservations').select('id, user_id, lot_id').eq('id', req.params.id).maybeSingle()
    if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
    const dono = r.user_id === req.user.id
    const parceiro = dono ? false : await podeOperarLot(req.user, r.lot_id)
    if (!dono && !parceiro) return res.status(404).json({ error: 'Reserva não encontrada.' })
    const { data } = await supabase.from('parking_change_requests')
      .select('id, new_end_at, new_units, new_total, delta, status, created_at')
      .eq('reservation_id', r.id).in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    res.json({ change: data || null })
  } catch (err) { next(err) }
})

// Pedidos de alteração pendentes/aprovados dos lots do parceiro.
router.get('/partner/change-requests', authenticate, async (req, res, next) => {
  try {
    const lots = await lotsDoParceiro(req.user)
    if (lots.length === 0) return res.json({ data: [] })
    const lotIds = lots.map((l) => l.id)
    const { data, error } = await supabase.from('parking_change_requests')
      .select('*, parking_reservations!inner(code, lot_id, user_id, start_at, end_at, plate, vehicle_type)')
      .in('status', ['pending', 'approved'])
      .in('parking_reservations.lot_id', lotIds)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json({ data: data || [] })
  } catch (err) { next(err) }
})

async function decidirAlteracao(req, res, next, novoStatus) {
  try {
    const { data: cr } = await supabase.from('parking_change_requests')
      .select('id, status, reservation_id, parking_reservations(lot_id, user_id, code)').eq('id', req.params.id).maybeSingle()
    if (!cr) return res.status(404).json({ error: 'Pedido não encontrado.' })
    if (!(await podeOperarLot(req.user, cr.parking_reservations?.lot_id))) return res.status(403).json({ error: 'Não é seu estacionamento.' })
    if (cr.status !== 'pending') return res.status(409).json({ error: 'Este pedido já foi decidido.' })
    const { error } = await supabase.from('parking_change_requests')
      .update({ status: novoStatus, decided_by: req.user.id, decided_at: new Date().toISOString() })
      .eq('id', cr.id).eq('status', 'pending')
    if (error) throw error
    try {
      const { notifyUser } = await import('../services/notify.js')
      const uid = cr.parking_reservations?.user_id
      if (uid) await notifyUser({
        userId: uid, templateKey: 'parking_change',
        title: novoStatus === 'approved' ? 'Alteração aprovada — pague a diferença' : 'Alteração recusada',
        body: novoStatus === 'approved' ? `Sua extensão da reserva ${cr.parking_reservations?.code} foi aprovada. Pague para confirmar.` : `A alteração da reserva ${cr.parking_reservations?.code} foi recusada.`,
      })
    } catch { /* opcional */ }
    res.json({ ok: true })
  } catch (err) { next(err) }
}
router.post('/partner/change-requests/:id/approve', authenticate, (req, res, next) => decidirAlteracao(req, res, next, 'approved'))
router.post('/partner/change-requests/:id/reject', authenticate, (req, res, next) => decidirAlteracao(req, res, next, 'rejected'))

// Cliente paga a diferença de uma alteração APROVADA → aplica a extensão.
router.post('/reservations/:id/change-pay', authenticate, async (req, res, next) => {
  try {
    const parsed = extendSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' })
    const { data: r } = await supabase.from('parking_reservations')
      .select('id, code, user_id, lot_id, vehicle_type, start_at, end_at, total_amount, status, payment_status').eq('id', req.params.id).maybeSingle()
    if (!r || r.user_id !== req.user.id) return res.status(404).json({ error: 'Reserva não encontrada.' })
    const { data: cr } = await supabase.from('parking_change_requests')
      .select('id, new_end_at, new_units, new_total, delta, status').eq('reservation_id', r.id).eq('status', 'approved').maybeSingle()
    if (!cr) return res.status(409).json({ error: 'Não há alteração aprovada para pagar.' })
    const delta = Number(cr.delta)
    if (delta > 0 && !parsed.data.card_token) return res.status(400).json({ error: 'Pagamento necessário.', delta })

    const { data: cliente } = await supabase.from('users').select('full_name, email, document_number, phone').eq('id', req.user.id).maybeSingle()
    const resultado = await cobrarExtensaoEAplicar({
      reserva: r, cliente, novo: { end_at: cr.new_end_at, units: cr.new_units, total: cr.new_total },
      cardToken: parsed.data.card_token, parcelas: parsed.data.parcelas || 1, idempotencyKey: parsed.data.idempotency_key,
    })
    if (resultado.estado !== 'approved') return res.status(402).json({ error: resultado.motivo || 'Pagamento não aprovado.' })
    if (!resultado.ok && resultado.no_capacity) return res.status(409).json({ error: 'Sem vaga para o período estendido. Se foi cobrado, processaremos o estorno.', refund_pending: delta > 0 })
    await supabase.from('parking_change_requests').update({ status: 'paid' }).eq('id', cr.id)
    res.json({ ok: true, new_end_at: cr.new_end_at, delta })
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

// ── Administração do catálogo (admin) ────────────────────────────────────────
// Cadastro/gestão de estacionamentos e tarifas. Só admin — é o que permite criar
// lots sem SQL manual. Regras de negócio (preço, comissão, prazos) ficam aqui,
// configuráveis, nunca fixas em código.
function soAdmin(req, res, next) {
  if (!ehAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito.' })
  next()
}

router.get('/admin/lots', authenticate, soAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('parking_lots')
      .select('*, parking_tariffs(id, vehicle_type, price_per_unit, hours_per_unit, min_units, is_active)')
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json({ data: data || [] })
  } catch (err) { next(err) }
})

// Todas as reservas (admin) — com nome do lot e do cliente; filtro por status.
router.get('/admin/reservations', authenticate, soAdmin, async (req, res, next) => {
  try {
    let q = supabase.from('parking_reservations')
      .select('id, code, lot_id, user_id, vehicle_type, plate, start_at, end_at, units, total_amount, status, payment_status, refund_status, refund_amount, created_at, parking_lots(name), users(full_name)')
      .order('created_at', { ascending: false }).limit(200)
    if (req.query.status) q = q.eq('status', req.query.status)
    let { data, error } = await q
    // Tolera ausência das colunas de reembolso (migration 113).
    if (error && (error.code === '42703' || error.code === 'PGRST200' || error.code === 'PGRST204')) {
      ;({ data, error } = await supabase.from('parking_reservations')
        .select('id, code, lot_id, user_id, vehicle_type, plate, start_at, end_at, units, total_amount, status, payment_status, created_at, parking_lots(name), users(full_name)')
        .order('created_at', { ascending: false }).limit(200))
    }
    if (error) throw error
    const out = (data || []).map(({ parking_lots, users, ...r }) => ({
      ...r, lot_name: parking_lots?.name || '—', user_name: users?.full_name || '—',
    }))
    res.json({ data: out })
  } catch (err) { next(err) }
})

// Repasses por parceiro (admin): agrupa o pago por dono do lot.
router.get('/admin/financial', authenticate, soAdmin, async (req, res, next) => {
  try {
    const from = req.query.from ? new Date(req.query.from).toISOString() : null
    let q = supabase.from('parking_reservations')
      .select('lot_id, total_amount, commission_pct, parking_lots(name, owner_user_id)')
      .eq('payment_status', 'paid')
    if (from) q = q.gte('created_at', from)
    const { data, error } = await q
    if (error) throw error

    const emCent = (v) => Math.round(Number(v || 0) * 100)
    const porDono = new Map()
    for (const r of data || []) {
      const dono = r.parking_lots?.owner_user_id || 'desconhecido'
      const b = emCent(r.total_amount)
      const c = Math.round(b * Number(r.commission_pct || 0) / 100)
      const acc = porDono.get(dono) || { owner_user_id: dono, brutoC: 0, comissaoC: 0, qtd: 0 }
      acc.brutoC += b; acc.comissaoC += c; acc.qtd += 1
      porDono.set(dono, acc)
    }
    const ids = [...porDono.keys()].filter((x) => x !== 'desconhecido')
    let nomes = {}
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, full_name').in('id', ids)
      nomes = Object.fromEntries((us || []).map((u) => [u.id, u.full_name]))
    }
    const reais = (c) => Math.round(c) / 100
    res.json({
      parceiros: [...porDono.values()].map((a) => ({
        owner_user_id: a.owner_user_id, nome: nomes[a.owner_user_id] || '—', qtd: a.qtd,
        bruto: reais(a.brutoC), comissao: reais(a.comissaoC), liquido: reais(a.brutoC - a.comissaoC),
      })),
    })
  } catch (err) { next(err) }
})

const lotSchema = z.object({
  name:          z.string().min(2).max(120),
  owner_user_id: z.string().uuid(),
  description:   z.string().max(1000).optional().nullable(),
  region_id:     z.string().uuid().optional().nullable(),
  lat:           z.number().optional().nullable(),
  lng:           z.number().optional().nullable(),
  capacity:      z.number().int().min(0),
  commission_pct: z.number().min(0).max(100).optional(),
  accept_deadline_min:  z.number().int().min(1).optional(),
  payment_deadline_min: z.number().int().min(1).optional(),
  pin_ttl_min:          z.number().int().min(1).optional(),
  refund_cutoff_min:    z.number().int().min(0).optional(),
  opening_hours: z.record(z.any()).optional(),
  photos:        z.array(z.string().max(2048)).max(10).optional(),
  is_active:     z.boolean().optional(),
})

router.post('/admin/lots', authenticate, soAdmin, async (req, res, next) => {
  try {
    const parsed = lotSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados do estacionamento inválidos.' })
    // Confere que o dono existe (FK já garante, mas damos erro claro).
    const { data: dono } = await supabase.from('users').select('id').eq('id', parsed.data.owner_user_id).maybeSingle()
    if (!dono) return res.status(400).json({ error: 'Usuário dono não encontrado.' })
    let { data, error } = await supabase.from('parking_lots').insert(parsed.data).select('id').single()
    // Tolera ausência da coluna refund_cutoff_min (migration 113).
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      const { refund_cutoff_min, ...sem } = parsed.data
      ;({ data, error } = await supabase.from('parking_lots').insert(sem).select('id').single())
    }
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { next(err) }
})

router.patch('/admin/lots/:id', authenticate, soAdmin, async (req, res, next) => {
  try {
    const parsed = lotSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' })
    const patch = { ...parsed.data, updated_at: new Date().toISOString() }
    let { error } = await supabase.from('parking_lots').update(patch).eq('id', req.params.id)
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      const { refund_cutoff_min, ...sem } = patch
      ;({ error } = await supabase.from('parking_lots').update(sem).eq('id', req.params.id))
    }
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
})

const tariffSchema = z.object({
  vehicle_type:   z.string().min(1).max(40),
  price_per_unit: z.number().min(0),
  hours_per_unit: z.number().int().min(1).optional(),
  min_units:      z.number().int().min(1).optional(),
})
router.post('/admin/lots/:id/tariffs', authenticate, soAdmin, async (req, res, next) => {
  try {
    const parsed = tariffSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados da tarifa inválidos.' })
    const { data, error } = await supabase.from('parking_tariffs')
      .insert({ lot_id: req.params.id, ...parsed.data }).select('id').single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { next(err) }
})
router.patch('/admin/tariffs/:id', authenticate, soAdmin, async (req, res, next) => {
  try {
    const parsed = tariffSchema.partial().extend({ is_active: z.boolean().optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.' })
    const { error } = await supabase.from('parking_tariffs').update(parsed.data).eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
