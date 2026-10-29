// Guia turístico como SERVIÇO ADICIONAL (is_transport = false, migration 089).
//
// O guia mora na tabela de veículos, mas não leva gente: não conta lugar, não
// supre a escolha do transporte e acompanha QUALQUER passeio. Aqui:
//   • roteamento (fleet.js) com um Supabase falso — as funções recebem o
//     cliente por parâmetro, então dá para testar de verdade;
//   • regras do carrinho (cartCheckout.js não importa nada → roda no node);
//   • presença dos recortes na API e nas telas (source-assertion, como o
//     resto da suíte), que é o que não pode sumir num refactor.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { modalIdByVehicle, modalIdsOf, ehCombo, requiredVehiclesByBooking } from '../src/services/fleet.js'
import { itemMissing, resumoDosVeiculos, requestPayloadFor } from '../../turista/src/lib/cartCheckout.js'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')

// Supabase falso: from().select().eq().in().is() e await. `semColunas` simula
// banco sem a migration (erro 42703 quando o select pede a coluna).
function supabaseFalso(tabelas, { semColunas = [] } = {}) {
  return {
    from(tabela) {
      const filtros = []
      let colunas = '*'
      const q = {
        select(c) { colunas = c; return q },
        eq(c, v) { filtros.push((r) => r[c] === v); return q },
        in(c, vs) { filtros.push((r) => vs.includes(r[c])); return q },
        is(c, v) { filtros.push((r) => (r[c] ?? null) === v); return q },
        then(ok, erro) {
          const falta = semColunas.find((c) => colunas.includes(c))
          // Devolve só as colunas pedidas, como o PostgREST.
          const pedidas = colunas === '*' ? null : colunas.split(',').map((c) => c.trim())
          const projetar = (row) => (pedidas ? Object.fromEntries(pedidas.map((c) => [c, row[c]])) : row)
          const r = falta
            ? { data: null, error: { code: '42703', message: `column ${tabela}.${falta} does not exist` } }
            : { data: (tabelas[tabela] || []).filter((row) => filtros.every((f) => f(row))).map(projetar), error: null }
          return Promise.resolve(r).then(ok, erro)
        },
      }
      return q
    },
  }
}

const HELI = 'v-heli', BUGGY = 'v-buggy', GUIA = 'v-guia'
const VEICULOS = [
  { id: HELI,  modal: 'aereo',     is_transport: true },
  { id: BUGGY, modal: 'terrestre', is_transport: true },
  { id: GUIA,  modal: 'terrestre', is_transport: false },
]
const MODAIS = [{ id: 'm-aereo', slug: 'aereo' }, { id: 'm-terra', slug: 'terrestre' }]

test('voo + guia NÃO vira combo: o guia não tem modal', async () => {
  const sb = supabaseFalso({ vehicles: VEICULOS, service_modals: MODAIS })
  const porVeiculo = await modalIdByVehicle(sb, [HELI, GUIA])
  assert.equal(porVeiculo.get(HELI), 'm-aereo')
  assert.equal(porVeiculo.has(GUIA), false, 'serviço adicional fica sem modal')
  const modais = modalIdsOf([HELI, GUIA], porVeiculo)
  assert.deepEqual([...modais], ['m-aereo'])
  assert.equal(ehCombo(modais), false, 'pedido continua indo para quem voa')
})

test('sem a 089 o modal segue como antes (tudo é transporte)', async () => {
  const sb = supabaseFalso({ vehicles: VEICULOS, service_modals: MODAIS }, { semColunas: ['is_transport'] })
  const porVeiculo = await modalIdByVehicle(sb, [HELI, GUIA])
  assert.equal(porVeiculo.get(GUIA), 'm-terra', 'fallback lê só id e modal')
  assert.equal(ehCombo(modalIdsOf([HELI, GUIA], porVeiculo)), true)
})

test('compartilhado: o guia da matriz não é exigido de quem atende', async () => {
  const sb = supabaseFalso({
    vehicles: VEICULOS,
    booking_vehicles: [],
    vehicle_pricing_rules: [
      { service_id: 'tour-1', vehicle_id: BUGGY, is_active: true },
      { service_id: 'tour-1', vehicle_id: GUIA,  is_active: true },
    ],
  })
  const r = await requiredVehiclesByBooking(sb, [{ id: 'bk-1', service_id: 'tour-1' }])
  assert.deepEqual(r.get('bk-1'), [BUGGY])
})

test('privativo com guia escolhido: o guia continua na reserva', async () => {
  // O operador que desligou o guia não deve receber um pedido que PEDE guia.
  const sb = supabaseFalso({
    vehicles: VEICULOS,
    booking_vehicles: [{ booking_id: 'bk-2', vehicle_id: BUGGY }, { booking_id: 'bk-2', vehicle_id: GUIA }],
    vehicle_pricing_rules: [],
  })
  const r = await requiredVehiclesByBooking(sb, [{ id: 'bk-2', service_id: 'tour-1' }])
  assert.deepEqual(r.get('bk-2').sort(), [BUGGY, GUIA].sort())
})

// ── Carrinho ─────────────────────────────────────────────────────────────────
const base = {
  kind: 'tour', mode: 'private', dateIso: '2026-11-20', time: '09:00',
  people: 4, origin_text: 'Pousada Sol', id: 'tour-1',
}
const buggy = { id: BUGGY, name: 'Buggy', qty: 1, price: 300, cap: 4 }
const guia  = { id: GUIA, name: 'Guia turístico', qty: 1, price: 150, cap: null, servico: true }

test('só o guia não basta: ainda falta veículo', () => {
  assert.ok(itemMissing({ ...base, vehicles: [guia] }).includes('veículo'))
})

test('o guia não soma lugar: 4 pessoas num buggy de 4 + guia está completo', () => {
  assert.deepEqual(itemMissing({ ...base, vehicles: [buggy, guia] }), [])
  // 5 pessoas: o guia não "completa" o lugar que falta.
  assert.ok(itemMissing({ ...base, people: 5, vehicles: [buggy, guia] }).includes('veículos para todas as pessoas'))
})

test('resumo sem "1x" no serviço', () => {
  assert.equal(resumoDosVeiculos([{ ...buggy, qty: 2 }, guia]), '2x Buggy + Guia turístico')
  assert.equal(resumoDosVeiculos([guia, buggy]), '1x Buggy + Guia turístico', 'transporte antes do serviço')
})

test('o guia vai na reserva junto dos veículos (é ele que o motor de preço cobra)', () => {
  const p = requestPayloadFor({ ...base, vehicles: [buggy, guia], total: 450 })
  assert.deepEqual(p.vehicles.map((v) => v.vehicle_id), [BUGGY, GUIA])
  assert.deepEqual(requestPayloadFor({ ...base, mode: 'shared', vehicles: [guia] }).vehicles, [])
})

// ── API e telas (presença dos recortes) ──────────────────────────────────────
test('passeio oferece o serviço pela regra geral, fora do modal, respeitando a célula desligada', () => {
  const tours = ler('../src/routes/tours.js')
  const i = tours.indexOf("router.get('/:id/vehicles'")
  const r = tours.slice(i, i + 9000)
  assert.match(r, /ehServico\(r\.vehicles\) \|\| mesmoModal\(r\.vehicles\)/)
  assert.match(r, /\.is\('service_id', null\)/)
  assert.match(r, /\.eq\('vehicles\.is_transport', false\)/, 'regra geral só para serviço, nunca para transporte')
  assert.match(r, /\.eq\('is_active', false\)/, 'célula desligada na matriz bloqueia a regra geral')
})

test('cadastro grava is_transport e tolera banco sem a 089', () => {
  const v = ler('../src/routes/vehicles.js')
  assert.match(v, /bool\('is_transport'\)/)
  assert.match(v, /PGRST204/)
  assert.match(v, /gravarVeiculo\(/)
})

test('translado nunca oferece o guia', () => {
  const t = ler('../src/routes/transfers.js')
  assert.match(t, /r\.vehicles\.is_transport !== false/)
  assert.match(t, /q = q\.eq\('is_transport', true\)/)
  const carrinho = ler('../../turista/src/pages/CartPage.jsx')
  assert.match(carrinho, /v\.is_transfer_allowed !== false && v\.is_active !== false && v\.is_transport !== false/)
})

test('carrinho separa "Serviços adicionais" e o Montar meu passeio também', () => {
  const carrinho = ler('../../turista/src/pages/CartPage.jsx')
  assert.match(carrinho, /function ServicosAdicionais/)
  assert.match(carrinho, /vehicles\.map\(\(v, i\) => v\.servico \? null :/, 'o guia sai da lista de veículos')
  const montar = ler('../../turista/src/pages/PasseioPersonalizado.jsx')
  assert.match(montar, /somenteServicos\(catalogo\)/)
  assert.match(montar, /Serviços: \$\{servicosEscolhidos/)
})
