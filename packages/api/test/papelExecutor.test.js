// Despacho de GUIA e de HELICÓPTERO + ponto de embarque fixo visível ao cliente.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PAPEIS, papelDe, papelValido } from '../src/lib/papelExecutor.js'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')

test('papel do executor: padrão é motorista; guia não tem veículo; piloto tem aeronave', () => {
  assert.equal(papelDe(null).nome, 'Motorista')
  assert.equal(papelDe({ executor_role: 'qualquer' }).nome, 'Motorista')
  assert.equal(papelDe({ executor_role: 'guide' }).veiculo, null)
  assert.equal(papelDe({ executor_role: 'pilot' }).veiculo, 'Aeronave')
  assert.equal(papelValido('pilot'), true); assert.equal(papelValido('toString'), false); assert.equal(papelValido(undefined), false)
  assert.deepEqual(Object.keys(PAPEIS), ['driver', 'guide', 'pilot'])
})

test('sugestão do papel na tela do operador: helicóptero vira piloto, o resto motorista', async () => {
  const { papelSugerido, papelExecutor } = await import('../../operador/src/lib/papelExecutor.js')
  assert.equal(papelSugerido({ booking_vehicles: [{ vehicle_name_snapshot: 'Helicóptero Robinson R44' }] }), 'pilot')
  assert.equal(papelSugerido({ service_name: 'Translado Aéreo — Helicóptero', booking_vehicles: [] }), 'pilot')
  assert.equal(papelSugerido({ booking_vehicles: [{ vehicle_name_snapshot: 'Buggy' }] }), 'driver')
  assert.equal(papelSugerido({ booking_vehicles: [] }), 'driver', 'sem veículo NÃO vira guia sozinho (compartilhado também não traz veículo)')
  assert.equal(papelExecutor('guide').campoVeiculo, null, 'guia não preenche placa')
  assert.match(papelExecutor('pilot').campoVeiculo, /Aeronave/)
})

test('despacho: papel validado, e a migração 132 pendente não apaga a chave PIX do executor', () => {
  const admin = ler('../src/routes/admin.js')
  const rota = admin.slice(admin.indexOf("router.post('/operational/:id/assign'"), admin.indexOf('// Atualiza status operacional da reserva'))
  assert.match(rota, /if \(papelValido\(req\.body\?\.executor_role\)\) payload\.executor_role = req\.body\.executor_role/)
  const soPapel = rota.indexOf("colunaFaltante(gravaErr) === 'executor_role'")
  const geral = rota.indexOf('gravar(semExtras(payload))')
  assert.ok(soPapel !== -1 && soPapel < geral, 'primeiro tenta sem o papel; só depois a regra geral')
  assert.match(rota.slice(soPapel, geral), /delete payload\.executor_role;\s*\(\{ data: result, error: gravaErr \} = await gravar\(payload\)\)/)
})

test('cliente e Ordem de Serviço falam a língua do serviço', () => {
  const zap = ler('../src/services/whatsapp.js')
  assert.match(zap, /\(papel\.veiculo \? `\$\{papel\.emoji\} \$\{papel\.veiculo\}: \$\{veiculo\}\\n` : ''\)/, 'guia não mostra linha de veículo')
  assert.match(zap, /`👤 \$\{papel\.nome\}: \$\{motorista\}/)
  assert.doesNotMatch(zap, /o motorista já está a caminho/)
  const os = ler('../../operador/src/pages/OsPublica.jsx')
  assert.match(os, /<Linha label=\{papel\.nome\}>\{assignment\?\.driver_name\}<\/Linha>/)
  const rotaOs = ler('../src/routes/os.js')
  assert.match(rotaOs, /dispatch_notes, executor_role'\)/)
  assert.match(rotaOs, /aErr\.code === '42703'/, 'OS abre sem a migração 132')
  const modal = ler('../../operador/src/components/DespacharModal.jsx')
  assert.match(modal, /const precisaVeiculo = !!papelExecutor\(f\.executor_role\)\.campoVeiculo/)
  assert.match(modal, /executor_role:\s+assign\?\.executor_role \|\| papelSugerido\(booking\)/)
})

test('ponto de embarque fixo: o cliente vê o ponto e não escolhe "local de saída"', async () => {
  const { temEmbarqueFixo } = await import('../../turista/src/lib/embarqueFixo.js')
  assert.equal(temEmbarqueFixo({ meeting_latitude: -2.79, meeting_longitude: -40.51 }), true)
  assert.equal(temEmbarqueFixo({ meeting_latitude: 0, meeting_longitude: 0 }), true)
  assert.equal(temEmbarqueFixo({ meeting_point_name: 'Heliponto', meeting_latitude: null, meeting_longitude: null }), false, 'nome sem coordenada não é ponto fixo (mesma regra do servidor)')
  assert.equal(temEmbarqueFixo(undefined), false)
  const tela = ler('../../turista/src/pages/TourDetail.jsx')
  assert.match(tela, /\{embarqueFixo \? \(/)
  assert.match(tela, /t\('tourDetailPg\.fixedBoardingLabel'\)/)
  assert.match(tela, /google\.com\/maps\/search\/\?api=1&query=/)
  // O servidor continua sendo quem manda no local gravado.
  const pay = ler('../src/routes/payments.js')
  assert.match(pay, /pickup_place_name:\s+mp\?\.meeting_point_name \|\| pickup_place_name \|\| null/)
  for (const l of ['pt', 'en', 'es']) {
    const j = JSON.parse(ler(`../../turista/src/i18n/locales/${l}.json`)).tourDetailPg
    for (const k of ['fixedBoardingLabel', 'fixedBoardingHint', 'fixedBoardingMap', 'fixedBoardingFallback']) assert.ok(j[k], `${l}.${k}`)
  }
})

test('migração 132 re-executável; empresa lê o papel sem depender dela', () => {
  const sql = ler('../../../supabase/migrations/132_papel_do_executor.sql')
  assert.match(sql, /ADD COLUMN IF NOT EXISTS executor_role text NOT NULL DEFAULT 'driver'/)
  assert.match(sql, /EXCEPTION WHEN duplicate_object THEN NULL/)
  const emp = ler('../src/routes/companyPayouts.js')
  assert.match(emp, /if \(colunaFaltante\(error\) === 'executor_role'\) \(\{ data, error \} = await consultar\(false\)\)/)
})
