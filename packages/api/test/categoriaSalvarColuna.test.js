// Regressão: salvar/editar categoria quando a coluna nova ainda não existe no
// banco (region_ids da migration 103, ou is_exclusive da 071).
//
// O bug: ao mandar region_ids no CORPO de um update/insert, o PostgREST recusa
// ANTES de chegar ao Postgres, com o código PGRST204 ("could not find the column
// ... in the schema cache") — e NÃO com 42703. O fallback antigo só olhava
// 42703, então o erro passava direto e o admin via "Categoria não encontrada"
// (404) ao salvar. O fallback precisa cobrir os dois códigos e degradar (salvar
// sem a coluna nova) em vez de estourar.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../src/routes/catalog.js', import.meta.url), 'utf8')

test('categoria: detecção de coluna nova cobre PGRST204 (corpo) além de 42703', () => {
  assert.match(src, /function colunaNovaAusente/, 'helper único de detecção')
  assert.match(src, /PGRST204/, 'precisa tratar o código do cache de schema do PostgREST')
  assert.match(src, /42703/, 'e o código do Postgres para filtro/SQL')
})

test('categoria: POST e PUT usam o fallback tolerante (degrada, não 404)', () => {
  const usos = src.match(/colunaNovaAusente\(/g) || []
  // definição + uso no POST + uso no PUT (com re-tentativa) = várias ocorrências
  assert.ok(usos.length >= 4, `colunaNovaAusente deve ser usado no insert e no update (achei ${usos.length})`)
})
