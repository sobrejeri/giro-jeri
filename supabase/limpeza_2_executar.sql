-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPEZA — PARTE 2 de 2: EXECUÇÃO
--
-- APAGA DE VERDADE. NÃO TEM COMO DESFAZER.
-- Rode a PARTE 1 antes e confira a lista de quem sai.
--
-- Apaga: todo usuário que não é admin, e o histórico de teste pendurado neles
--        (reservas, pagamentos, comissões, despachos, avaliações, lançamentos,
--        cotações, cupons resgatados, repasses).
--
-- MANTÉM: seu admin, o catálogo inteiro (passeios, transfers, rotas, veículos),
--         os preços do motor, os feriados, as temporadas, as regiões, os
--         cupons (o cadastro, não os resgates) e os estabelecimentos.
--
-- ATENÇÃO — MERCADO PAGO: apagar o registro NÃO estorna cobrança nenhuma. Se a
-- parte 1 mostrou pagamento aprovado, resolva no painel do MP ANTES de rodar
-- isto — depois você perde o vínculo entre a cobrança e a reserva.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Congela o alvo numa tabela temporária. Sem isso, cada passo recalcularia
-- "quem não é admin" e um cadastro novo no meio da execução entraria na
-- limpeza por acidente.
CREATE TEMP TABLE _alvo_usuarios ON COMMIT DROP AS
  SELECT id FROM users WHERE user_type <> 'admin';

CREATE TEMP TABLE _alvo_reservas ON COMMIT DROP AS
  SELECT id FROM bookings
   WHERE user_id     IN (SELECT id FROM _alvo_usuarios)
      OR operator_id IN (SELECT id FROM _alvo_usuarios);

-- ── 1. O que BLOQUEIA a exclusão da reserva ─────────────────────────────────
-- Estas quatro têm ON DELETE RESTRICT: sem apagá-las primeiro, o DELETE das
-- reservas falha com erro de chave estrangeira.
DELETE FROM commissions            WHERE booking_id IN (SELECT id FROM _alvo_reservas);
DELETE FROM operational_assignments WHERE booking_id IN (SELECT id FROM _alvo_reservas);
DELETE FROM payments               WHERE booking_id IN (SELECT id FROM _alvo_reservas);
DELETE FROM reviews                WHERE booking_id IN (SELECT id FROM _alvo_reservas);

-- Avaliação feita pelo usuário sem vínculo com reserva (RESTRICT em users).
DELETE FROM reviews                WHERE user_id    IN (SELECT id FROM _alvo_usuarios);

-- ── 2. Lançamentos financeiros ──────────────────────────────────────────────
-- SET NULL não bloquearia, mas deixaria lançamento órfão inflando o Financeiro
-- com dinheiro de teste.
DELETE FROM financial_ledger       WHERE booking_id IN (SELECT id FROM _alvo_reservas);

-- ── 3. Repasses (migration 080) ─────────────────────────────────────────────
-- Some por CASCADE junto com a reserva, mas o DELETE explícito deixa o efeito
-- à vista na contagem. `IF EXISTS` porque a 080 pode não ter sido aplicada.
DO $$
BEGIN
  IF to_regclass('public.booking_payouts') IS NOT NULL THEN
    DELETE FROM booking_payouts WHERE booking_id IN (SELECT id FROM _alvo_reservas);
  END IF;
END $$;

-- ── 4. As reservas ──────────────────────────────────────────────────────────
-- booking_items, booking_vehicles, booking_legs e booking_payouts têm CASCADE
-- e somem junto.
DELETE FROM bookings               WHERE id         IN (SELECT id FROM _alvo_reservas);

-- ── 5. O que ainda prende o usuário ─────────────────────────────────────────
DELETE FROM transfer_quotes        WHERE user_id    IN (SELECT id FROM _alvo_usuarios);
DELETE FROM coupon_redemptions     WHERE user_id    IN (SELECT id FROM _alvo_usuarios);

-- ── 6. Os usuários ──────────────────────────────────────────────────────────
-- Endereços, favoritos, notificações e preferências de operação têm CASCADE.
DELETE FROM users                  WHERE id         IN (SELECT id FROM _alvo_usuarios);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA — deve sobrar só o admin, e o catálogo intacto
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'usuários'    AS o_que, count(*) AS quantidade FROM users
UNION ALL SELECT 'reservas',        count(*) FROM bookings
UNION ALL SELECT 'pagamentos',      count(*) FROM payments
UNION ALL SELECT '— passeios (deve continuar igual)',  count(*) FROM tours
UNION ALL SELECT '— rotas (deve continuar igual)',     count(*) FROM transfer_routes
UNION ALL SELECT '— veículos (deve continuar igual)',  count(*) FROM vehicles
UNION ALL SELECT '— feriados (deve continuar igual)',  count(*) FROM holidays
UNION ALL SELECT '— preços (deve continuar igual)',    count(*) FROM pricing_rules;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO FINAL, NO PAINEL — NÃO É SQL
--
-- A conta de LOGIN vive no Auth do Supabase, separada do perfil. O SQL acima
-- apagou o perfil; o login continua existindo e segue ocupando o e-mail e o
-- CNPJ — o que impede recadastrar as mesmas pessoas nos testes reais.
--
-- Vá em Authentication → Users e apague:
--   • denilson@gmail.com
--   • 20653342000118@op.girojeri.app   (o operador entra por documento, e o
--                                       e-mail de login é sintético)
-- Mantenha sobrejeri@gmail.com.
-- ─────────────────────────────────────────────────────────────────────────────
