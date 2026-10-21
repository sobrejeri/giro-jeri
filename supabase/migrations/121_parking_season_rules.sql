-- =============================================================================
-- 121_parking_season_rules.sql — Alta temporada e feriados POR ESTACIONAMENTO
-- =============================================================================
-- Os passeios/transfers já têm alta temporada e feriados, mas são do ADMIN e por
-- REGIÃO (high_season_rules / holidays). Aqui cada estacionamento define as
-- SUAS regras: faixas de temporada (recorrentes, o ano é ignorado) e feriados
-- (data exata). Cada regra tem um acréscimo percentual (+X% na diária) OU fixo
-- (+R$ por diária). O cálculo é por DIÁRIA: só as diárias que caem num dia de
-- regra recebem o acréscimo (ver services/parking/seasonRules.js).
--
-- Acesso só pela API (service_role) — RLS ligada sem políticas públicas.
-- Idempotente (IF NOT EXISTS).
-- =============================================================================

CREATE TABLE IF NOT EXISTS parking_season_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id           uuid NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  kind             text NOT NULL DEFAULT 'season',            -- 'season' | 'holiday'
  name             text,
  start_date       date,                                      -- season: início (ano ignorado)
  end_date         date,                                      -- season: fim
  holiday_date     date,                                      -- holiday: data exata (com ano)
  additional_type  text NOT NULL DEFAULT 'percentage',        -- 'percentage' | 'fixed'
  additional_value numeric NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parking_season_rules_kind_chk CHECK (kind IN ('season','holiday')),
  CONSTRAINT parking_season_rules_type_chk CHECK (additional_type IN ('percentage','fixed'))
);

CREATE INDEX IF NOT EXISTS idx_parking_season_rules_lot
  ON parking_season_rules (lot_id) WHERE is_active;

ALTER TABLE parking_season_rules ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'parking_season_rules' ORDER BY ordinal_position;
