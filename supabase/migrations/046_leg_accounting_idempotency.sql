-- =============================================================================
-- 046_leg_accounting_idempotency.sql
-- =============================================================================
-- Idempotência da contabilidade POR PERNA (Etapa 2). Hoje recordLegAccounting()
-- faz INSERT direto em financial_ledger/commissions sem chave de unicidade — se
-- uma corrida webhook+polling processar o mesmo pagamento aprovado, os
-- lançamentos por perna podem DUPLICAR. Estes índices únicos dão a garantia no
-- banco, e a API passa a usar upsert(ignoreDuplicates) contra eles.
--
-- Por perna existe no máximo:
--   • 1 comissão            → UNIQUE (commissions.leg_id)
--   • 2 lançamentos ledger  → commission_platform e payout_operator
--                             → UNIQUE (financial_ledger.leg_id, entry_type)
--
-- Índices NÃO-parciais de propósito: leg_id NULL (lançamentos de nível-pedido:
-- booking_gross/gateway_fee/booking_net e comissões antigas) é tratado como
-- DISTINTO pelo Postgres, então NENHUMA linha existente com leg_id NULL entra
-- em conflito — múltiplos booking_gross seguem permitidos. Índice não-parcial é
-- necessário para servir de alvo de ON CONFLICT via PostgREST/upsert.
--
-- Seguro aplicar: a flag booking_legs_engine_enabled está OFF, logo não há
-- nenhuma linha com leg_id NÃO-NULO ainda → não há duplicatas pré-existentes.
-- Idempotente: DROP INDEX IF EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
-- =============================================================================

-- financial_ledger: substitui o índice não-único (042) por um único composto.
-- (leg_id, entry_type) já serve também as buscas por leg_id (prefixo à esquerda).
DROP INDEX IF EXISTS idx_financial_ledger_leg;
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_ledger_leg_entry
  ON financial_ledger (leg_id, entry_type);

-- commissions: 1 comissão por perna.
DROP INDEX IF EXISTS idx_commissions_leg;
CREATE UNIQUE INDEX IF NOT EXISTS uq_commissions_leg
  ON commissions (leg_id);

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   SELECT indexname FROM pg_indexes
--    WHERE tablename IN ('financial_ledger','commissions')
--      AND indexname LIKE 'uq_%leg%';
--   -- Esperado: uq_financial_ledger_leg_entry, uq_commissions_leg
