// ── loyalty.js ──────────────────────────────────────────
// Pontos de fidelidade Turiva. Ganho ao pagar uma reserva (1 ponto por R$ 1).
// Best-effort e idempotente (índice único user_id+kind+ref): nunca derruba o
// fluxo de pagamento e não credita a mesma reserva duas vezes.

import { supabase } from '../supabase.js'

// Quantos pontos por real gasto.
const PONTOS_POR_REAL = 1

export async function creditarPontosReserva(booking) {
  try {
    if (!booking?.user_id) return
    const valor = Number(booking.total_amount) || 0
    const pontos = Math.floor(valor * PONTOS_POR_REAL)
    if (pontos <= 0) return
    await supabase.from('loyalty_points').insert({
      user_id:     booking.user_id,
      points:      pontos,
      kind:        'earn_booking',
      ref:         booking.id,
      description: `Reserva ${booking.booking_code || ''}`.trim(),
    })
  } catch (err) {
    // 23505 = já creditado (idempotência). 42P01 = migração 099 pendente.
    if (!['23505', '42P01'].includes(err?.code)) {
      console.error('[loyalty] crédito falhou booking=%s err=%s', booking?.id, err?.message)
    }
  }
}

// Saldo + histórico do usuário. Tolerante à tabela ausente.
export async function saldoEExtrato(userId, limite = 30) {
  try {
    const { data, error } = await supabase
      .from('loyalty_points')
      .select('id, points, kind, description, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limite)
    if (error) throw error
    const itens = data || []
    // Saldo real: soma tudo (não só a página). Query agregada à parte.
    const { data: todos } = await supabase
      .from('loyalty_points').select('points').eq('user_id', userId)
    const saldo = (todos || []).reduce((s, r) => s + Number(r.points || 0), 0)
    return { saldo, itens }
  } catch {
    return { saldo: 0, itens: [] }
  }
}
