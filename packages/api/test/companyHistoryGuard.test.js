// Protecao do historico de reservas ao (des)vincular operador a empresa.
// O teste de banco com UPDATE/ROLLBACK deve ser executado separadamente;
// este teste verifica a implementacao versionada sem alteracao de dados.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../../../supabase/migrations/135_bloquear_troca_empresa_com_reservas.sql', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const team = fs.readFileSync(new URL('../src/routes/companyTeam.js', import.meta.url), 'utf8');

test('troca do company_id e bloqueada se existem bookings atribuídas ao operador', () => {
  assert.match(sql, /NEW\.company_id IS DISTINCT FROM OLD\.company_id/);
  assert.match(sql, /FROM public\.bookings b\s+WHERE b\.operator_id = OLD\.id/);
  assert.match(sql, /BEFORE UPDATE OF company_id ON public\.users/);
  assert.match(sql, /ERRCODE = '23514'/);
  assert.match(sql, /users_company_booking_history_guard/);
});

test('guard preserva outros fluxos e nao reescreve reservas', () => {
  assert.doesNotMatch(sql, /UPDATE\s+public\.bookings\s+SET/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.bookings/i);
  assert.doesNotMatch(sql, /SECURITY\s+DEFINER/i);
  assert.match(sql, /SET search_path = ''/);
  assert.match(team, /company_removed_at: agora/);
  assert.match(team, /company_id: req\.user\.id/);
});

test('admin explica ao usuario que o vinculo historico foi preservado', () => {
  const ifGuard = admin.indexOf("if (error?.code === '23514' && /reservas anteriores");
  const ifLegacy = admin.indexOf("if (error?.code === '23514' && /company/");
  assert.ok(ifGuard > 0 && ifLegacy > ifGuard);
  assert.match(admin.slice(ifGuard, ifLegacy), /status\(409\)/);
  assert.match(admin.slice(ifGuard, ifLegacy), /O vínculo não foi alterado/);
});
