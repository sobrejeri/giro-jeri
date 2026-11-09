// Paradas do "Montar meu passeio" definidas pelo admin (migração 127).
//
// O cliente escolhe as paradas na lista do admin; fora dela, "Outro destino"
// (texto livre) vai marcado para a cooperativa avaliar. Aqui a rota pública
// roda de verdade (Express + cliente do Supabase falso); o resto é asserção de
// fonte, como no resto da suíte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import express from 'express'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')

const JIJOCA = '11111111-1111-4111-8111-111111111111'
const CRUZ   = '22222222-2222-4222-8222-222222222222'
const PARADAS = [
  { id: 'p1', name: 'Pedra Furada',     description: null, region_ids: [],       sort_order: 1, is_active: true },
  { id: 'p2', name: 'Lagoa do Paraíso', description: 'Jijoca', region_ids: [JIJOCA], sort_order: 2, is_active: true },
  { id: 'p3', name: 'Praia do Preá',    description: null, region_ids: [CRUZ],   sort_order: 3, is_active: true },
  { id: 'p4', name: 'Desativada',       description: null, region_ids: [],       sort_order: 4, is_active: false },
]

// Sobe a rota real com o cliente do Supabase trocado por um falso.
async function subir({ semTabela = false } = {}) {
  process.env.SUPABASE_URL ||= 'http://supabase.teste'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'sb_secret_teste'
  const { supabase } = await import('../src/supabase.js')
  supabase.from = () => {
    const filtros = []
    const q = {
      select() { return q },
      eq(c, v) { filtros.push((r) => r[c] === v); return q },
      order() { return q },
      then(ok, erro) {
        const r = semTabela
          ? { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.tour_stop_options' in the schema cache" } }
          : { data: PARADAS.filter((p) => filtros.every((f) => f(p))), error: null }
        return Promise.resolve(r).then(ok, erro)
      },
    }
    return q
  }
  const { default: router } = await import('../src/routes/tourStops.js')
  const app = express()
  app.use('/api/tour-stops', router)
  const srv = await new Promise((ok) => { const s = app.listen(0, () => ok(s)) })
  const base = `http://127.0.0.1:${srv.address().port}/api/tour-stops`
  return { base, fechar: () => new Promise((ok) => srv.close(ok)) }
}

test('cliente em Jijoca vê as gerais + as de Jijoca, sem as desativadas', async () => {
  const { base, fechar } = await subir()
  try {
    const r = await fetch(`${base}?region_id=${JIJOCA}`).then((x) => x.json())
    assert.deepEqual(r.data.map((p) => p.name), ['Pedra Furada', 'Lagoa do Paraíso'])
    assert.ok(r.data.every((p) => !('region_ids' in p)), 'não expõe os municípios ao app')
  } finally { await fechar() }
})

test('cliente em Cruz não vê a parada só de Jijoca', async () => {
  const { base, fechar } = await subir()
  try {
    const r = await fetch(`${base}?region_id=${CRUZ}`).then((x) => x.json())
    assert.deepEqual(r.data.map((p) => p.name), ['Pedra Furada', 'Praia do Preá'])
  } finally { await fechar() }
})

test('sem a migração 127, a API avisa e o app cai na lista antiga', async () => {
  const { base, fechar } = await subir({ semTabela: true })
  try {
    const res = await fetch(base)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { data: [], indisponivel: true })
  } finally { await fechar() }
  const montar = ler('../../turista/src/pages/PasseioPersonalizado.jsx')
  assert.match(montar, /if \(paradasErro \|\| paradasData\?\.indisponivel\) return pontosDaRegiao\(region\)/)
})

test('só o admin cria, edita e apaga paradas', () => {
  const rota = ler('../src/routes/tourStops.js')
  for (const r of ["router.get('/admin'", "router.post('/'", "router.put('/:id'", "router.delete('/:id'"]) {
    const i = rota.indexOf(r)
    assert.notEqual(i, -1, r)
    assert.match(rota.slice(i, i + 80), /authenticate, requireAdmin/, `${r} exige admin`)
  }
  assert.match(rota, /'23505'\) return res\.status\(409\)/, 'nome repetido vira 409 com mensagem')
  assert.match(ler('../src/index.js'), /app\.use\('\/api\/tour-stops', tourStopsRoutes\)/)
})

test('a cotação guarda de onde veio cada parada e marca o "Outro destino" para a cooperativa', () => {
  const tq = ler('../src/routes/tourQuotes.js')
  assert.match(tq, /stop_id: z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/)
  assert.match(tq, /outro:\s+z\.boolean\(\)\.optional\(\)/)
  assert.match(tq, /roteiroTexto\(data, \{ marcarOutro: true \}\)/, 'aviso à cooperativa marca o destino escrito')
  const wa = ler('../src/services/whatsapp.js')
  assert.match(wa, /const rota = roteiroTexto\(quote, \{ marcarOutro: true \}\)/)
  const op = ler('../../operador/src/pages/Reservas.jsx')
  assert.match(op, /const nomeDaParada = \(s\) => \(s\?\.outro \? `\$\{s\.name\} \(outro destino\)` : s\?\.name\)/)
  assert.match(op, /Destino fora da lista/)
})

test('o app escolhe a parada na lista (não mais na busca do mapa)', () => {
  const montar = ler('../../turista/src/pages/PasseioPersonalizado.jsx')
  assert.match(montar, /<SeletorDeParada/)
  assert.doesNotMatch(montar, /sugestoes=\{\{ tipo: 'pontos'/, 'as paradas não usam mais o PlaceInput')
  assert.match(montar, /\.\.\.\(s\.outro \? \{ outro: true \} : \{\}\)/)
  const seletor = ler('../../turista/src/components/SeletorDeParada.jsx')
  assert.match(seletor, /Outro destino/)
})

test('migração 127: idempotente e sem recarregar o que o admin apagou', () => {
  const sql = ler('../../../supabase/migrations/127_tour_stop_options.sql')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS tour_stop_options/)
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_tour_stop_options_name\s+ON tour_stop_options \(lower\(btrim\(name\)\)\)/)
  assert.match(sql, /WHERE NOT EXISTS \(SELECT 1 FROM tour_stop_options\)/, 'carga inicial só com a tabela vazia')
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
})
