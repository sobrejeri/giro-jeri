// Precificação do estacionamento: diárias e total são calculados no servidor.
// Estes testes cobrem a regra de diária (teto de horas/24, mínimo) e a soma em
// centavos (sem erro de ponto flutuante).

import test from 'node:test'
import assert from 'node:assert/strict'
import { diariasDe, cotarEstacionamento } from '../src/services/parking/pricing.js'

const H = 3_600_000

test('1 diária para períodos de até 24h', () => {
  const t0 = Date.parse('2026-10-10T10:00:00-03:00')
  assert.equal(diariasDe(t0, t0 + 1 * H), 1)
  assert.equal(diariasDe(t0, t0 + 24 * H), 1)
})

test('fração acima de 24h vira a diária seguinte (teto)', () => {
  const t0 = Date.parse('2026-10-10T10:00:00-03:00')
  assert.equal(diariasDe(t0, t0 + 25 * H), 2)
  assert.equal(diariasDe(t0, t0 + 48 * H), 2)
  assert.equal(diariasDe(t0, t0 + 49 * H), 3)
})

test('respeita o mínimo de diárias configurado', () => {
  const t0 = Date.parse('2026-10-10T10:00:00-03:00')
  assert.equal(diariasDe(t0, t0 + 1 * H, { minDiarias: 2 }), 2)
})

test('horas por diária configurável (ex.: 12h)', () => {
  const t0 = Date.parse('2026-10-10T10:00:00-03:00')
  assert.equal(diariasDe(t0, t0 + 13 * H, { horasPorDiaria: 12 }), 2)
})

test('saída igual/antes da entrada é inválida', () => {
  const t0 = Date.parse('2026-10-10T10:00:00-03:00')
  assert.throws(() => diariasDe(t0, t0))
  assert.throws(() => diariasDe(t0, t0 - 1))
})

test('total soma em centavos, sem erro de float', () => {
  const t0 = Date.parse('2026-10-10T10:00:00-03:00')
  // 0.1 * 3 estoura em float; aqui tem de dar exatamente 0.30.
  const r = cotarEstacionamento({ startMs: t0, endMs: t0 + 72 * H, precoDiaria: 0.1 })
  assert.equal(r.diarias, 3)
  assert.equal(r.totalCents, 30)
  assert.equal(r.total, 0.3)
})

test('cotação com 2 diárias a R$30', () => {
  const t0 = Date.parse('2026-10-10T10:00:00-03:00')
  const r = cotarEstacionamento({ startMs: t0, endMs: t0 + 25 * H, precoDiaria: 30 })
  assert.equal(r.diarias, 2)
  assert.equal(r.total, 60)
})
