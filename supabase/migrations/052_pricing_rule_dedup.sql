-- =============================================================================
-- 052_pricing_rule_dedup.sql
-- =============================================================================
-- Impede REGRAS DUPLICADAS de preço para o mesmo veículo + passeio (+ região).
-- Duplicatas quebram o toggle do Motor de Preços: a matriz desliga uma regra,
-- mas a duplicata ativa sobrevive e o veículo continua aparecendo no app.
--
-- ⚠️ ORDEM DE EXECUÇÃO: rode ANTES o SQL de limpeza (remove as duplicatas
--    existentes) — senão a criação do índice único FALHA. O bloco de limpeza
--    está no comentário abaixo; rode-o no editor, confira, e só então aplique
--    esta migration.
-- =============================================================================

-- Índice único: 1 regra por (veículo, passeio, região) para service_type='tour'.
-- COALESCE trata region_id NULL como um valor fixo (senão o Postgres consideraria
-- vários NULL como distintos e deixaria duplicar).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rule_vehicle_service_region
  ON vehicle_pricing_rules (
    vehicle_id,
    service_id,
    COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE service_type = 'tour' AND service_id IS NOT NULL;

-- ── LIMPEZA (rode no editor ANTES da migration acima) ─────────────────────────
-- Diagnóstico — lista as duplicatas:
--   SELECT vehicle_id, service_id, count(*) AS regras,
--          array_agg(id) AS ids, array_agg(base_price) AS precos,
--          array_agg(is_active) AS ativos
--     FROM vehicle_pricing_rules
--    WHERE service_type = 'tour'
--    GROUP BY vehicle_id, service_id, COALESCE(region_id,'00000000-0000-0000-0000-000000000000'::uuid)
--   HAVING count(*) > 1;
--
-- Remove as duplicatas, mantendo a regra mais recente por (veículo, passeio,
-- região):
--   DELETE FROM vehicle_pricing_rules vpr
--    USING (
--      SELECT id, ROW_NUMBER() OVER (
--               PARTITION BY vehicle_id, service_id,
--                            COALESCE(region_id,'00000000-0000-0000-0000-000000000000'::uuid)
--               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
--             ) AS rn
--        FROM vehicle_pricing_rules
--       WHERE service_type = 'tour'
--    ) d
--    WHERE vpr.id = d.id AND d.rn > 1;
