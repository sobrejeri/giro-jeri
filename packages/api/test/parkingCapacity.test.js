// Disponibilidade por intervalo (anti-overbooking). A regra: o que barra uma
// reserva é o PICO de ocupação em qualquer trecho do período — não a soma de
// todos os pedidos que cruzam qualquer parte dele. Intervalos são [início, fim).

import test from 'node:test'
import assert from 'node:assert/strict'
import { picoDeOcupacao, temVaga } from '../src/services/parking/capacity.js'

const H = 3_600_000
const d = (iso) => Date.parse(iso)

test('[início, fim): saída 10h e entrada 10h compartilham capacidade', () => {
  const blocks = [
    { start: d('2026-10-10T08:00:00-03:00'), end: d('2026-10-10T10:00:00-03:00'), qty: 1 },
    { start: d('2026-10-10T10:00:00-03:00'), end: d('2026-10-10T12:00:00-03:00'), qty: 1 },
  ]
  // Pico na janela inteira é 1 (nunca há 2 ao mesmo tempo).
  const pico = picoDeOcupacao(blocks, d('2026-10-10T08:00:00-03:00'), d('2026-10-10T12:00:00-03:00'))
  assert.equal(pico, 1)
})

test('sobreposição real soma no pico', () => {
  const blocks = [
    { start: d('2026-10-10T08:00:00-03:00'), end: d('2026-10-10T12:00:00-03:00'), qty: 1 },
    { start: d('2026-10-10T10:00:00-03:00'), end: d('2026-10-10T14:00:00-03:00'), qty: 1 },
  ]
  const pico = picoDeOcupacao(blocks, d('2026-10-10T08:00:00-03:00'), d('2026-10-10T14:00:00-03:00'))
  assert.equal(pico, 2)
})

test('pico considera só a janela pedida, não o dia todo', () => {
  const blocks = [
    // Lotado de manhã, mas a janela pedida é à tarde.
    { start: d('2026-10-10T06:00:00-03:00'), end: d('2026-10-10T09:00:00-03:00'), qty: 5 },
    { start: d('2026-10-10T14:00:00-03:00'), end: d('2026-10-10T16:00:00-03:00'), qty: 1 },
  ]
  const pico = picoDeOcupacao(blocks, d('2026-10-10T13:00:00-03:00'), d('2026-10-10T17:00:00-03:00'))
  assert.equal(pico, 1)
})

test('temVaga: última vaga respeita o pico do intervalo', () => {
  const blocks = [
    { start: d('2026-10-10T10:00:00-03:00'), end: d('2026-10-11T10:00:00-03:00'), qty: 1 },
    { start: d('2026-10-10T12:00:00-03:00'), end: d('2026-10-10T18:00:00-03:00'), qty: 1 },
  ]
  // Capacidade 2, querendo +1 num intervalo que pega o pico (2) → não cabe.
  const r = temVaga({ capacidade: 2, blocks, start: d('2026-10-10T13:00:00-03:00'), end: d('2026-10-10T14:00:00-03:00'), want: 1 })
  assert.equal(r.pico, 2)
  assert.equal(r.cabe, false)
})

test('temVaga: cabe quando o pico deixa folga', () => {
  const blocks = [
    { start: d('2026-10-10T10:00:00-03:00'), end: d('2026-10-10T12:00:00-03:00'), qty: 1 },
  ]
  const r = temVaga({ capacidade: 2, blocks, start: d('2026-10-10T10:00:00-03:00'), end: d('2026-10-10T12:00:00-03:00'), want: 1 })
  assert.equal(r.pico, 1)
  assert.equal(r.disponivel, 1)
  assert.equal(r.cabe, true)
})

test('temVaga ignora blocos que não tocam a janela', () => {
  const blocks = [
    { start: d('2026-10-09T10:00:00-03:00'), end: d('2026-10-09T18:00:00-03:00'), qty: 9 }, // dia anterior
  ]
  const r = temVaga({ capacidade: 1, blocks, start: d('2026-10-10T10:00:00-03:00'), end: d('2026-10-10T12:00:00-03:00'), want: 1 })
  assert.equal(r.pico, 0)
  assert.equal(r.cabe, true)
})
