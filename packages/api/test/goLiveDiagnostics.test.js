import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verificarSegredosDeCadastro,
  verificarColunas,
  verificarTabela,
} from '../src/lib/goLiveDiagnostics.js';

test('OTP e cadastro usam derivacao segura quando ha service role', () => {
  const out = verificarSegredosDeCadastro({ SUPABASE_SERVICE_ROLE_KEY: 'chave-protegida' });
  assert.equal(out.ok, true);
  assert.match(out.detalhe, /derivadas/);
});

test('dois segredos dedicados fortes dispensam fallback', () => {
  const out = verificarSegredosDeCadastro({
    OTP_PEPPER: 'o'.repeat(32),
    SIGNUP_TOKEN_SECRET: 's'.repeat(32),
  });
  assert.equal(out.ok, true);
  assert.equal(out.detalhe, 'segredos dedicados definidos');
});

test('segredo curto isolado nao e suficiente', () => {
  const out = verificarSegredosDeCadastro({ OTP_PEPPER: 'curto', SIGNUP_TOKEN_SECRET: 's'.repeat(32) });
  assert.equal(out.ok, false);
});

test('segredos curtos caem no fallback de service role', () => {
  const out = verificarSegredosDeCadastro({
    OTP_PEPPER: 'curto', SIGNUP_TOKEN_SECRET: 'curto', SUPABASE_SERVICE_ROLE_KEY: 'chave-protegida',
  });
  assert.equal(out.ok, true);
  assert.match(out.detalhe, /derivadas/);
});

test('sem segredo e sem service role e critico', () => {
  assert.equal(verificarSegredosDeCadastro({}).ok, false);
});

const banco = (erro = null) => ({
  from(table) {
    return {
      select(columns, options) {
        return {
          async limit(qtd) {
            assert.ok(table);
            assert.ok(columns);
            assert.equal(options.head, true);
            assert.equal(qtd, 1);
            return { error: erro };
          },
        };
      },
    };
  },
});

test('colunas presentes produzem OK em consulta HEAD', async () => {
  assert.equal(await verificarColunas(banco(), 'tours', ['quote_only', 'quote_stops']), true);
});

test('erro de schema ou permissao nunca produz falso OK', async () => {
  assert.equal(await verificarColunas(banco({ code: '42703' }), 'tours', ['quote_only']), false);
  assert.equal(await verificarTabela(banco({ code: '42501' }), 'external_bookings'), false);
});

test('falha de rede e tratada como nao verificada', async () => {
  const fora = { from() { throw new Error('offline'); } };
  assert.equal(await verificarColunas(fora, 'users', ['company_id']), false);
  assert.equal(await verificarTabela(fora, 'external_bookings'), false);
});

test('checagem vazia de colunas e invalida', async () => {
  assert.equal(await verificarColunas(banco(), 'users', []), false);
});

test('tabela existente produz OK em consulta HEAD', async () => {
  assert.equal(await verificarTabela(banco(), 'company_seller_payouts'), true);
});
