// ── tourStops.js — PARADAS do "Montar meu passeio" (lista do admin) ──────────
//
// O cliente escolhe as paradas do passeio personalizado nesta lista (migração
// 127), em vez de buscar qualquer lugar no mapa — o admin controla para onde os
// roteiros vão. Fora dela, o app oferece "Outro destino": o cliente escreve e a
// cooperativa avalia na cotação.
//
//   GET    /api/tour-stops?region_id=…  público: ativas daquele município
//   GET    /api/tour-stops/admin        admin: todas (inclusive desligadas)
//   POST   /api/tour-stops              admin: cria
//   PUT    /api/tour-stops/:id          admin: edita
//   DELETE /api/tour-stops/:id          admin: apaga

import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../supabase.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()

const COLS = 'id, name, description, region_ids, sort_order, is_active'

// Migração 127 ainda não aplicada: a tabela não existe (Postgres 42P01; o
// PostgREST novo responde PGRST205 "Could not find the table").
const tabelaAusente = (e) => e?.code === '42P01' || e?.code === 'PGRST205'

const paradaSchema = z.object({
  name:        z.string().trim().min(2, 'Informe o nome da parada').max(150),
  description: z.string().trim().max(300).optional().nullable(),
  // Vazio = aparece em todos os municípios.
  region_ids:  z.array(z.string().uuid()).max(200).optional(),
  sort_order:  z.number({ coerce: true }).int().min(0).max(9999).optional(),
  is_active:   z.boolean().optional(),
})

function limpar(body) {
  const out = { ...body }
  if (out.description !== undefined) out.description = out.description || null
  return out
}

function responderErro(err, res, next) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: err.errors?.[0]?.message || 'Dados inválidos', details: err.errors })
  }
  if (err?.code === '23505') return res.status(409).json({ error: 'Já existe uma parada com esse nome.' })
  if (tabelaAusente(err)) {
    return res.status(503).json({ error: 'A lista de paradas ainda não foi criada no banco (migração 127).' })
  }
  next(err)
}

// ── GET /api/tour-stops — o que o cliente vê ─────────────────────────────────
// Sem a migração, devolve `indisponivel` e o app cai na lista que ele já tinha
// — o "Montar meu passeio" não fica sem paradas no intervalo.
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('tour_stop_options')
      .select('id, name, description, region_ids, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .order('name')
    if (error) {
      if (tabelaAusente(error)) {
        console.warn('[tour-stops] tabela ausente (migração 127 pendente)')
        return res.json({ data: [], indisponivel: true })
      }
      throw error
    }
    const regiao = req.query.region_id || null
    const doMunicipio = (p) => !regiao || !(p.region_ids || []).length || p.region_ids.includes(regiao)
    res.json({ data: (data || []).filter(doMunicipio).map(({ region_ids: _r, ...p }) => p) })
  } catch (err) { next(err) }
})

// ── GET /api/tour-stops/admin — lista completa para o Catálogo ──────────────
router.get('/admin', authenticate, requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('tour_stop_options').select(COLS).order('sort_order').order('name')
    if (error) throw error
    res.json({ data: data || [] })
  } catch (err) { responderErro(err, res, next) }
})

router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const body = limpar(paradaSchema.parse(req.body))
    const { data, error } = await supabase.from('tour_stop_options').insert(body).select(COLS).single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { responderErro(err, res, next) }
})

router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const body = limpar(paradaSchema.partial().parse(req.body))
    const { data, error } = await supabase
      .from('tour_stop_options').update(body).eq('id', req.params.id).select(COLS).maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Parada não encontrada.' })
    res.json(data)
  } catch (err) { responderErro(err, res, next) }
})

// Apagar não mexe nos pedidos já feitos: a cotação guarda o NOME da parada.
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase.from('tour_stop_options').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { responderErro(err, res, next) }
})

export default router
