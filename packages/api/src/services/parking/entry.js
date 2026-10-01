// ── parking/entry.js — Entrada no pátio + retirada com PIN (fase 7) ──────────
//
// SEGREDOS. O PIN de retirada é um segredo de uso único: gerado com CSPRNG,
// nunca persistido em claro (guardamos só o hash salgado), devolvido ao DONO
// da reserva uma única vez, e NUNCA ao parceiro / em log / push / URL. O código
// de entrada é só um identificador operacional (não-secreto) e é diferente do
// PIN. A verificação + consumo acontecem atomicamente na função SQL.

import crypto from 'node:crypto'
import { supabase } from '../../supabase.js'

// Sem caracteres ambíguos (0/O, 1/I) — para quem digita/dita no balcão.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function codigoSeguro(tam) {
  const bytes = crypto.randomBytes(tam)
  let out = ''
  for (let i = 0; i < tam; i++) out += ALFABETO[bytes[i] % ALFABETO.length]
  return out
}

// PIN só de dígitos (teclado numérico no balcão), via rejeição sem viés.
function pinNumerico(tam) {
  let out = ''
  while (out.length < tam) {
    const b = crypto.randomBytes(1)[0]
    if (b < 250) out += String(b % 10)   // 0..249 → sem viés de módulo
  }
  return out
}

function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(`${pin}:${salt}`).digest('hex')
}

// Gera (ou reusa) o código de entrada não-secreto da reserva. Idempotente.
export async function garantirCodigoEntrada(reservationId) {
  const { data: r } = await supabase
    .from('parking_reservations').select('id, entry_code').eq('id', reservationId).maybeSingle()
  if (!r) return null
  if (r.entry_code) return r.entry_code
  // Poucas colisões possíveis (índice único) → tenta algumas vezes.
  for (let i = 0; i < 6; i++) {
    const code = codigoSeguro(6)
    const { error } = await supabase
      .from('parking_reservations').update({ entry_code: code })
      .eq('id', reservationId).is('entry_code', null)
    if (!error) {
      const { data } = await supabase.from('parking_reservations').select('entry_code').eq('id', reservationId).maybeSingle()
      if (data?.entry_code) return data.entry_code
    }
  }
  return null
}

// Registra a entrada no pátio pelo código apresentado (parceiro). Atômico.
export async function registrarEntrada({ lotId, code, actorId, spot, plate }) {
  const { data, error } = await supabase.rpc('parking_register_entry', {
    p_lot_id: lotId, p_code: code, p_actor: actorId, p_spot: spot || null, p_plate: plate || null,
  })
  if (error) throw error
  return data
}

// Abre um pedido de retirada: gera o PIN, guarda só o hash, devolve o PIN em
// claro UMA vez (para o dono da reserva). Reusa um pendente ainda válido só se
// precisar — aqui sempre cria um novo e invalida os anteriores pendentes.
export async function abrirRetirada({ reservationId, ttlMin }) {
  const salt = crypto.randomBytes(16).toString('hex')
  const pin  = pinNumerico(6)
  const expiresAt = new Date(Date.now() + (ttlMin || 5) * 60_000).toISOString()

  // Invalida pendentes anteriores desta reserva (um ativo por vez — índice único).
  await supabase.from('parking_withdrawals')
    .update({ status: 'cancelled' }).eq('reservation_id', reservationId).eq('status', 'pending')

  const { error } = await supabase.from('parking_withdrawals').insert({
    reservation_id: reservationId,
    pin_hash: hashPin(pin, salt),
    pin_salt: salt,
    expires_at: expiresAt,
  })
  if (error) throw error
  // O PIN em claro só sai daqui — nunca é relido do banco.
  return { pin, expires_at: expiresAt }
}

// Consome o PIN apresentado no balcão (parceiro). Verifica contra TODOS os PINs
// pendentes do lot: para cada salt, calcula o hash candidato e deixa a função
// SQL fazer a comparação + consumo atômico. Rate-limit e consumo único no SQL.
export async function consumirRetirada({ lotId, pin, actorId }) {
  const { data: pendentes } = await supabase
    .from('parking_withdrawals')
    .select('pin_salt, parking_reservations!inner(lot_id)')
    .eq('status', 'pending')
    .eq('parking_reservations.lot_id', lotId)

  // Um hash candidato por salt pendente; o SQL casa qualquer um e consome o
  // único que bater. Uma submissão = uma tentativa (rate-limit no SQL).
  const salts = [...new Set((pendentes || []).map((w) => w.pin_salt))]
  if (salts.length === 0) return { ok: false, error: 'invalid_pin' }

  const candidates = salts.map((salt) => hashPin(pin, salt))
  const { data, error } = await supabase.rpc('parking_consume_withdrawal', {
    p_lot_id: lotId, p_candidate_hashes: candidates, p_actor: actorId,
  })
  if (error) throw error
  return data || { ok: false, error: 'invalid_pin' }
}
