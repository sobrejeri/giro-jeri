// A migration 089 e os scripts que a acompanham.
//
// O que estes testes protegem:
//  • a 089 não pode reclassificar dado sozinha (sem UPDATE, sem backfill por
//    nome) — quem decide é o admin, um cadastro por vez;
//  • a coluna tem de nascer TRUE, senão aplicar a migration faria serviços e
//    veículos trocarem de papel de uma vez em produção;
//  • o script de marcação não pode vir com IDs inventados;
//  • o script de identificação não pode decidir por nome.
//
// A aplicação em Postgres real (pglite) foi feita fora da suíte — pglite não é
// dependência do projeto e não vale adicioná-la só para isto. Resultado
// registrado em docs/SEGURANCA.md.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const raiz = new URL('../../../supabase/', import.meta.url)
const ler = (p) => fs.readFileSync(new URL(p, raiz), 'utf8')

const migration  = ler('migrations/089_veiculo_vs_servico.sql')
const identifica = ler('scripts/089_identificar_servicos.sql')
const marca      = ler('scripts/089_marcar_servicos.sql')
const reverte    = ler('scripts/089_reverter.sql')

test('a migration só cria estrutura — não mexe em dado nenhum', () => {
  const semComentarios = migration.replace(/--.*$/gm, '')
  for (const perigoso of [/\bUPDATE\b/i, /\bDELETE\b/i, /\bINSERT\b/i]) {
    assert.ok(!perigoso.test(semComentarios),
      `a 089 não pode conter ${perigoso} — reclassificar é decisão humana`)
  }
})

test('a coluna nasce TRUE: aplicar a migration não muda comportamento', () => {
  assert.ok(/is_transport BOOLEAN NOT NULL DEFAULT TRUE/i.test(migration),
    'DEFAULT FALSE faria todo veículo virar serviço no momento da aplicação')
})

test('a migration é idempotente', () => {
  assert.ok(/ADD COLUMN IF NOT EXISTS/i.test(migration))
  assert.ok(/CREATE INDEX IF NOT EXISTS/i.test(migration))
})

test('nenhum script reclassifica por nome', () => {
  for (const [nome, sql] of [['identificar', identifica], ['marcar', marca]]) {
    assert.ok(!/ILIKE|LIKE\s*'%/i.test(sql.replace(/--.*$/gm, '')),
      `${nome}: casar nome por LIKE reclassificaria "Buggy do Guia Pedro" por engano`)
  }
})

test('a identificação usa sinais estruturais e histórico de uso', () => {
  assert.ok(/seat_capacity = 1/.test(identifica),     'falta o sinal de 1 assento')
  assert.ok(/booking_vehicles/.test(identifica),      'falta o histórico de transporte real')
  assert.ok(/assentos_usados/.test(identifica),       'falta expor assentos já transportados')
  const semComentarios = identifica.replace(/--.*$/gm, '')
  assert.ok(!/\b(UPDATE|DELETE|INSERT)\b/i.test(semComentarios),
    'a consulta de identificação tem de ser só leitura')
})

test('o script de marcação não traz ID inventado', () => {
  // Só pode haver UUID dentro de comentário (o exemplo). Nenhum ativo.
  const ativo = marca.replace(/--.*$/gm, '')
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(ativo),
    'não pode haver UUID fora de comentário — os IDs reais só existem em produção')
})

test('o script de marcação abre transação e termina em ROLLBACK', () => {
  assert.ok(/^BEGIN;/m.test(marca), 'precisa de BEGIN para permitir conferir antes')
  assert.ok(/^ROLLBACK;/m.test(marca),
    'tem de terminar em ROLLBACK — trocar para COMMIT deve ser ato consciente')
  assert.ok(/^-- COMMIT;/m.test(marca), 'o COMMIT fica comentado, ao lado')
})

test('a reversão tem nível de dado antes do nível de esquema', () => {
  const iDado = reverte.indexOf('SET is_transport = TRUE')
  const iDrop = reverte.indexOf('DROP COLUMN')
  assert.ok(iDado !== -1 && iDrop !== -1)
  assert.ok(iDado < iDrop, 'desfazer a marcação vem antes de remover a coluna')
  assert.ok(/^-- ALTER TABLE vehicles DROP COLUMN/m.test(reverte),
    'o DROP fica comentado: é o passo raro')
})

test('o código tolera banco sem a coluna — a reversão não quebra tela', async () => {
  const { ehTransporte, somenteTransporte } =
    await import('../../turista/src/lib/transporte.js')
  // Como vem de um banco sem a 089 aplicada:
  const semColuna = [{ id: 'a', seat_capacity: 4 }, { id: 'b', seat_capacity: 8 }]
  assert.equal(somenteTransporte(semColuna).length, 2,
    'sem a coluna, nada pode sumir da tela')
  assert.equal(ehTransporte({}), true, 'undefined tem de ser tratado como transporte')
})
