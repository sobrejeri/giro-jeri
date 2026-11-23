// Regressao: vendas externas sao historico da empresa, inclusive sem reserva
// paga pela plataforma. Teste de fonte; teste transacional fica no Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../../../supabase/migrations/136_proteger_vendas_externas_ao_trocar_empresa.sql', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const companhia = fs.readFileSync(new URL('../src/routes/companyBookings.js', import.meta.url), 'utf8');

test('historico de reservas E vendas externas impede mudar company_id', () => {
  assert.match(sql, /NEW\.company_id IS DISTINCT FROM OLD\.company_id/);
  assert.match(sql, /FROM public\.bookings b\s+WHERE b\.operator_id = OLD\.id/);
  assert.match(sql, /FROM public\.external_bookings e\s+WHERE e\.operator_id = OLD\.id\s+AND e\.company_id = OLD\.company_id/);
  assert.match(sql, /ERRCODE = '23514'/);
  assert.match(sql, /users_company_booking_history_guard/);
});

test('primeira vinculacao de operador sem empresa permanece permitida', () => {
  assert.match(sql, /OLD\.company_id IS NOT NULL/);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\./i);
  assert.doesNotMatch(sql, /UPDATE\s+public\.(?:users|bookings|external_bookings)\s+SET/i);
});

test('admin informa preservacao de vendas externas e resposta 409', () => {
  const i = admin.indexOf("if (error?.code === '23514' && /reservas anteriores");
  assert.ok(i > 0);
  const trecho = admin.slice(i, i + 450);
  assert.match(trecho, /status\(409\)/);
  assert.match(trecho, /reservas ou vendas externas anteriores/);
  assert.match(trecho, /O vínculo não foi alterado/);
});

test('vendas externas possuem snapshot company_id no relatorio da empresa', () => {
  assert.match(companhia, /\.eq\('company_id', req\.user\.id\)/);
});
