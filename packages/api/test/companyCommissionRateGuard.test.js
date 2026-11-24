// Histórico financeiro ao trocar o percentual da comissão do vendedor.
// Testes de código/contrato. Cenários transacionais da migração 138 rodam
// separadamente no Supabase TURIVA com BEGIN/ROLLBACK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../../../supabase/migrations/138_proteger_percentual_comissoes_pendentes.sql', import.meta.url), 'utf8');
const team = fs.readFileSync(new URL('../src/routes/companyTeam.js', import.meta.url), 'utf8');
const seller = fs.readFileSync(new URL('../src/routes/companySellerPayouts.js', import.meta.url), 'utf8');

const editar = team.slice(team.indexOf("router.patch('/team/:id'"), team.indexOf("router.post('/team/:id/password'"));

test('banco bloqueia taxa nova se existir reserva nao liquidada sob taxa anterior', () => {
  assert.match(sql, /NEW\.company_commission_pct IS DISTINCT FROM OLD\.company_commission_pct/);
  assert.match(sql, /OLD\.company_commission_pct > 0/);
  assert.match(sql, /b\.operator_id = OLD\.id/);
  assert.match(sql, /b\.created_at >= OLD\.company_commission_since/);
  assert.match(sql, /b\.status_commercial::text NOT IN \('paid', 'cancelled', 'refunded', 'expired'\)/);
  assert.match(sql, /BEFORE UPDATE OF company_commission_pct, company_commission_since/);
});

test('banco exige lancar comissoes pagas antes de apagar regra antiga', () => {
  assert.match(sql, /FROM public\.company_seller_payouts p/);
  assert.match(sql, /p\.booking_id = b\.id/);
  assert.match(sql, /p\.company_id = OLD\.company_id/);
  assert.match(sql, /ERRCODE = '23514'/);
});

test('regra do banco nao executa pagamento nem expõe RPC a usuarios publicos', () => {
  assert.doesNotMatch(sql, /SECURITY\s+DEFINER/);
  assert.match(sql, /SET search_path = ''/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.guard_company_commission_rate_history/);
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /UPDATE\s+public\.bookings\b/i);
  assert.doesNotMatch(sql, /UPDATE\s+public\.company_seller_payouts\b/i);
});

test('edicao da equipe recusa pendentes antes de gravar percentual novo', () => {
  assert.match(team, /'company_commission_since'/);
  assert.match(editar, /\.eq\('operator_id', op\.id\)/);
  assert.match(editar, /\.gte\('created_at', op\.company_commission_since\)/);
  assert.match(editar, /\.not\('status_commercial', 'in', '\(paid,cancelled,refunded,expired\)'\)/);
  assert.match(editar, /pendentes\.error/);
  assert.match(editar, /pendentes\.count \?\? 0/);
  const precheck = editar.indexOf('const pendentes = await supabase');
  const update = editar.indexOf(".from('users').update({ ...mudancas");
  assert.ok(precheck > 0 && precheck < update, 'validar antes do UPDATE');
});

test('falha de materializacao ou guard do banco retorna 409 e preserva regra antiga', () => {
  const materializar = editar.indexOf('const materializacao = await materializarComissoes');
  const atualizar = editar.indexOf(".from('users').update({ ...mudancas");
  assert.ok(materializar >= 0 && materializar < atualizar);
  assert.match(editar, /if \(materializacao\.pendente\) return res\.status\(409\)/);
  assert.match(editar, /users_commission_rate_history_guard/);
  assert.match(editar, /res\.status\(409\)/);
  assert.match(seller, /onConflict: 'booking_id', ignoreDuplicates: true/, 'materializacao idempotente');
});
