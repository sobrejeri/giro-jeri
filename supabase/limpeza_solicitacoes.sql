-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPEZA DAS SOLICITAÇÕES DE TESTE
--
-- Apaga TODAS as reservas e o que está pendurado nelas. Os USUÁRIOS FICAM —
-- Denilson, copper e o admin continuam como estão, com login e cadastro
-- intactos. O catálogo, os preços, os feriados e as regiões também.
--
-- São duas partes. Rode a PARTE 1 sozinha primeiro e confira os números; a
-- PARTE 2 é a que apaga, e não tem como desfazer.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — CONFERÊNCIA (só lê, não altera nada)
-- ═════════════════════════════════════════════════════════════════════════════

SELECT 'reservas'                     AS registro, count(*) AS quantidade FROM bookings
UNION ALL SELECT 'pagamentos',                 count(*) FROM payments
UNION ALL SELECT 'comissões',                  count(*) FROM commissions
UNION ALL SELECT 'despachos (ordens de serviço)', count(*) FROM operational_assignments
UNION ALL SELECT 'avaliações',                 count(*) FROM reviews
UNION ALL SELECT 'lançamentos financeiros',    count(*) FROM financial_ledger
UNION ALL SELECT 'notificações ligadas a reserva', count(*) FROM notifications WHERE booking_id IS NOT NULL
UNION ALL SELECT 'cotações COM reserva (saem)', count(*) FROM transfer_quotes WHERE booking_id IS NOT NULL
UNION ALL SELECT '(fica) cotações sem reserva',  count(*) FROM transfer_quotes WHERE booking_id IS NULL
UNION ALL SELECT '(fica) usuários',            count(*) FROM users
 ORDER BY 2 DESC;

-- Dinheiro que passou por essas reservas.
-- ATENÇÃO: apagar o registro NÃO estorna nada no Mercado Pago. Se aparecer
-- pagamento aprovado, confira no painel do MP ANTES — depois de apagar, some o
-- vínculo entre a cobrança e a reserva.
SELECT status, count(*) AS pagamentos, coalesce(sum(amount), 0) AS total
  FROM payments GROUP BY status ORDER BY 3 DESC;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — EXECUÇÃO (apaga de verdade)
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- A ordem importa: estas quatro têm ON DELETE RESTRICT sobre `bookings`. Sem
-- apagá-las primeiro, o DELETE das reservas falha com erro de chave estrangeira
-- no meio do script.
DELETE FROM commissions;
DELETE FROM operational_assignments;
DELETE FROM payments;
DELETE FROM reviews;

-- SET NULL não bloquearia, mas deixaria lançamento órfão inflando o Financeiro
-- com dinheiro de teste.
DELETE FROM financial_ledger;

-- Também SET NULL: sem isto, o sino do app fica com avisos apontando para
-- reservas que não existem mais.
DELETE FROM notifications WHERE booking_id IS NOT NULL;

-- Cotações ligadas a alguma reserva. TÊM que sair ANTES das reservas.
--
-- `transfer_quotes.booking_id` é ON DELETE SET NULL, e esse SET NULL é um
-- UPDATE — que faz o Postgres revalidar a linha inteira. A tabela tem
-- CHECK (service_date >= CURRENT_DATE): uma cotação de julho já está inválida
-- hoje, e o UPDATE falha com 23514, derrubando o script no meio.
--
-- Apagando a cotação antes, não há SET NULL e o problema não acontece. As
-- cotações SEM reserva continuam intocadas (é o DELETE opcional no fim).
DELETE FROM transfer_quotes WHERE booking_id IS NOT NULL;

-- Repasses (migration 080). Somem por CASCADE junto com a reserva; o DELETE
-- explícito deixa o efeito à vista na contagem. O IF existe porque a 080 pode
-- não ter sido aplicada.
DO $$
BEGIN
  IF to_regclass('public.booking_payouts') IS NOT NULL THEN
    DELETE FROM booking_payouts;
  END IF;
END $$;

-- As reservas. `booking_items`, `booking_vehicles`, `booking_legs` e
-- `booking_payouts` têm CASCADE e somem junto.
DELETE FROM bookings;

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA FINAL — as de cima zeradas, as de baixo intactas
-- ═════════════════════════════════════════════════════════════════════════════
SELECT 'reservas'          AS o_que, count(*) AS quantidade FROM bookings
UNION ALL SELECT 'pagamentos',        count(*) FROM payments
UNION ALL SELECT 'despachos',         count(*) FROM operational_assignments
UNION ALL SELECT '— usuários',        count(*) FROM users
UNION ALL SELECT '— passeios',        count(*) FROM tours
UNION ALL SELECT '— rotas',           count(*) FROM transfer_routes
UNION ALL SELECT '— veículos',        count(*) FROM vehicles
UNION ALL SELECT '— feriados',        count(*) FROM holidays
UNION ALL SELECT '— preços',          count(*) FROM pricing_rules;


-- ─────────────────────────────────────────────────────────────────────────────
-- OPCIONAL — cotações de rota personalizada
--
-- Não entram acima porque não são reservas: são pedidos de orçamento que nunca
-- viraram reserva. Se também forem de teste, rode esta linha:
--
--   DELETE FROM transfer_quotes;
-- ─────────────────────────────────────────────────────────────────────────────
