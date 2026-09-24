// Filtro de MUNICÍPIO por operador (migration 106).
//
// Escala multi-estado: um operador só recebe solicitação cujo booking.region_id
// está entre os municípios que ele atende. Regra: OPT-IN ESTRITO — sem município
// marcado, não recebe nada. Admin nunca é filtrado.
//
// operatorServesRegion é função pura → teste de verdade. A fila e a notificação
// dependem do Supabase real, então aqui garantimos a PRESENÇA do recorte
// (source-assertion), que é o que não pode sumir num refactor.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { operatorServesRegion } from '../src/services/fleet.js'

const operador = fs.readFileSync(new URL('../src/routes/operator.js', import.meta.url), 'utf8')
const notify   = fs.readFileSync(new URL('../src/services/notify.js', import.meta.url), 'utf8')
const fleet    = fs.readFileSync(new URL('../src/services/fleet.js', import.meta.url), 'utf8')

test('operatorServesRegion é opt-in estrito', () => {
  const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  // Sem município marcado → não atende nada (o ponto do recurso).
  assert.equal(operatorServesRegion(new Set(),  A), false)
  assert.equal(operatorServesRegion(undefined,  A), false)
  // Atende só o que está no conjunto.
  assert.equal(operatorServesRegion(new Set([A]), A), true)
  assert.equal(operatorServesRegion(new Set([A]), B), false)
  // Reserva sem município não casa com ninguém.
  assert.equal(operatorServesRegion(new Set([A]), null), false)
})

test('operatorRegionSets é tolerante à coluna ausente (fail-open só nesse caso)', () => {
  const i = fleet.indexOf('export async function operatorRegionSets')
  assert.notEqual(i, -1)
  const fn = fleet.slice(i, i + 700)
  assert.ok(/42703|region_ids/.test(fn), 'precisa detectar a coluna ausente')
  assert.ok(/return null/.test(fn), 'coluna ausente → null (o chamador não filtra)')
})

test('a fila do operador recorta por município (estrito) e não filtra o admin', () => {
  const i = operador.indexOf("router.get('/bookings'")
  assert.notEqual(i, -1)
  const r = operador.slice(i, i + 6000)
  assert.ok(/operatorRegionSets/.test(r) && /serveMunicipio/.test(r),
    'a fila precisa aplicar o filtro de município')
  assert.ok(/BOOKING_COLUMNS[\s\S]*region_id/.test(operador) || /region_id/.test(r),
    'as reservas precisam trazer region_id para o corte')
  // Admin não é filtrado (o corte vive sob !isAdmin).
  assert.ok(/if \(!isAdmin\)[\s\S]{0,600}operatorRegionSets/.test(r),
    'o filtro de município só se aplica a não-admin')
})

test('a notificação de solicitação recorta operador por município e mantém admin', () => {
  const i = notify.indexOf('export async function notifyOperatorsAndAdmin')
  assert.notEqual(i, -1)
  const fn = notify.slice(i, i + 4000)
  assert.ok(/region_ids/.test(fn), 'a notificação precisa olhar region_ids do operador')
  assert.ok(/user_type === 'admin'|user_type === "admin"/.test(fn),
    'admin/finance sempre recebe (não é cortado por município)')
  assert.ok(/for \(const m of alvoMunic\) if \(set\.has\(m\)\)/.test(fn),
    'operador só recebe se houver interseção entre seus municípios e o(s) da reserva')
})

test('há fallback pelos municípios do SERVIÇO quando a reserva não tem region_id', () => {
  const i = fleet.indexOf('export async function serviceRegionIdsBatch')
  assert.notEqual(i, -1, 'o helper de fallback precisa existir')
  const fn = fleet.slice(i, i + 1600)
  assert.ok(/from\('transfers'\)[\s\S]*region_ids/.test(fn), 'transfer resolve por transfers.region_ids')
  assert.ok(/from\('tours'\)/.test(fn) && /from\('categories'\)[\s\S]*region_ids/.test(fn),
    'tour resolve pelas region_ids das suas categorias')
  assert.ok(/serviceRegionIdsBatch/.test(operador), 'a fila usa o fallback')
  assert.ok(/serviceRegionIdsBatch/.test(notify),   'a notificação usa o fallback')
})
