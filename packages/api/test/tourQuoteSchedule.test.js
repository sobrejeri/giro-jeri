import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  avaliarPrazoCotacaoPasseio, regrasPrazoPasseio,
  ANTECEDENCIA_PADRAO_COTACAO_HORAS,
} from '../src/lib/tourQuoteSchedule.js'

const agora = Date.parse('2026-11-28T05:53:00Z') // 02:53 America/Fortaleza
const passeio = {
  min_advance_hours: 1,
  booking_cutoff_time: '15:30:00',
  service_window_start: null, service_window_end: null,
}
const avaliar = (date, time, tour = passeio, nowMs = agora) =>
  avaliarPrazoCotacaoPasseio({ date, time, tour, nowMs })

test('passeio do print: aplica 1 hora de antecedência configurada e cutoff às 15h30', () => {
  assert.deepEqual(regrasPrazoPasseio(passeio), { hours: 1, cutoff: '15:30' })
  assert.equal(avaliar('2026-11-28', '03:52').ok, false)
  assert.equal(avaliar('2026-11-28', '03:54').ok, true)
  assert.equal(avaliar('2026-11-28', '08:00').ok, true)
})

test('cutoff: pedido feito às 15h30 para hoje é recusado, amanhã permitido', () => {
  const t = Date.parse('2026-11-28T18:30:00Z')
  const r = avaliar('2026-11-28', '21:00', passeio, t)
  assert.equal(r.ok, false)
  assert.equal(r.minDateIso, '2026-11-29')
  assert.match(r.error, /limite.*15:30/)
  assert.equal(avaliar('2026-11-29', '08:00', passeio, t).ok, true)
})

test('perto da meia-noite, calendário escolhe outro dia e horário mínimo é local', () => {
  const t = Date.parse('2026-11-29T01:40:00Z') // 28/11 às 22:40
  const r = avaliar('2026-11-29', '01:00', null, t)
  assert.equal(ANTECEDENCIA_PADRAO_COTACAO_HORAS, 3)
  assert.equal(r.minDateIso, '2026-11-29')
  assert.equal(r.minTime, '01:41')
  assert.equal(r.ok, false)
  assert.equal(avaliar('2026-11-29', '01:41', null, t).ok, true)
})

test('passeio não configurado usa padrão; regra zero explícita respeitada', () => {
  assert.equal(regrasPrazoPasseio(null).hours, 3)
  assert.equal(regrasPrazoPasseio({ min_advance_hours: null }).hours, 3)
  assert.equal(regrasPrazoPasseio({ min_advance_hours: 0 }).hours, 0)
  assert.equal(avaliar('2026-11-28', '02:54', { min_advance_hours: 0, booking_cutoff_time: '15:30' }).ok, true)
})

test('janela cadastrada impede horários fora do período do passeio', () => {
  const t = { ...passeio, service_window_start: '08:00:00', service_window_end: '18:00:00' }
  assert.equal(avaliar('2026-11-28', '07:00', t).ok, false)
  assert.equal(avaliar('2026-11-28', '08:00', t).ok, true)
  assert.equal(avaliar('2026-11-28', '18:01', t).ok, false)
})

test('datas impossíveis ou horas fora de 00:00-23:59 são rejeitadas', () => {
  assert.equal(avaliar('2026-02-30', '08:00').ok, false)
  assert.equal(avaliar('2026-11-28', '25:00').ok, false)
  assert.equal(avaliar('2026-11-28', '08:90').ok, false)
})

test('cotação API exige veículo e verifica prazos ANTES de inserir ou aceitar', () => {
  const s = fs.readFileSync(new URL('../src/routes/tourQuotes.js', import.meta.url), 'utf8')
  assert.match(s, /vehicle_type:\s+z\.string\(\)\.trim\(\)\.min\(2/)
  const criar = s.slice(s.indexOf("router.post('/', authenticate"), s.indexOf("router.get('/', authenticate"))
  assert.ok(criar.indexOf('avaliarPrazoCotacaoPasseio(') > 0)
  assert.ok(criar.indexOf('avaliarPrazoCotacaoPasseio(') < criar.indexOf(".from('tour_quotes')\n      .insert("))
  const aceitar = s.slice(s.indexOf("router.post('/:id/accept'"), s.indexOf("router.post('/:id/reject'"))
  assert.ok(aceitar.indexOf('avaliarPrazoCotacaoPasseio(') > 0)
  assert.ok(aceitar.indexOf('avaliarPrazoCotacaoPasseio(') < aceitar.indexOf("status: 'accepted'"))
})

test('formulário Turista exige veículo, mostra antecedência e bloqueia data/hora inválidas', () => {
  const s = fs.readFileSync(new URL('../../turista/src/pages/PasseioPersonalizado.jsx', import.meta.url), 'utf8')
  assert.match(s, /const veiculoEscolhido = escolhidos\.length > 0/)
  assert.match(s, /const canSubmit = !!region\?\.id && veiculoEscolhido && prazo\.ok/)
  assert.match(s, /minDate=\{minDate\}/)
  assert.match(s, /min=\{minTime\}/)
  assert.match(s, /obrigatório/)
  assert.match(s, /Selecione pelo menos um veículo para continuar/)
  assert.match(s, /Antecedência mínima: \{prazo\.hours\}/)
})
