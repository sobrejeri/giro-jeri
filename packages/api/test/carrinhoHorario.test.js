// Filtragem de horário no carrinho (turista).
//
// O seletor nativo de horário (iOS) ignora min/max — dava para rolar até 23:58
// e agendar passeio de madrugada; só o "Salvar" barrava. Agora o horário é uma
// LISTA de opções válidas: o que não pode nem aparece. A janela por serviço
// (admin, migration 069) manda; sem janela, passeio usa padrão diurno e
// translado fica livre (transfer de aeroporto de madrugada é legítimo).

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(
  new URL('../../turista/src/pages/CartPage.jsx', import.meta.url), 'utf8')

test('o horário deixou de ser roda livre (input type=time)', () => {
  assert.ok(!/type="time"/.test(src), 'a roda nativa ignorava os limites — trocada por lista')
})

test('a lista de horários é gerada dentro da janela válida', () => {
  assert.match(src, /horariosDisponiveis/)
  assert.match(src, /opcoesHorario\.map\(\(h\) =>/, 'o seletor renderiza as opções válidas')
})

test('passeio sem janela usa padrão diurno; translado fica livre', () => {
  assert.match(src, /winStart \?\? \(isTransfer \? 0 : 5 \* 60\)/, 'passeio começa 05:00, translado 00:00')
  assert.match(src, /winEnd\s*\?\?\s*\(isTransfer \? 23 \* 60 \+ 30 : 18 \* 60\)/, 'passeio termina 18:00, translado 23:30')
})

test('a janela do serviço (admin) tem prioridade sobre o padrão', () => {
  // Usa winStart/winEnd (service_window_*) quando existem; o padrão é só fallback.
  assert.match(src, /const winStart = toMin\(item\.service_window_start/)
  assert.match(src, /const winEnd\s+= toMin\(item\.service_window_end/)
})

test('respeita a antecedência do mesmo dia no primeiro horário', () => {
  assert.match(src, /Math\.max\(faixaIni, sameDay \? earliestTodayMin : 0\)/)
})
