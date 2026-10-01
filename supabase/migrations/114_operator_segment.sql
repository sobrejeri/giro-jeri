-- =============================================================================
-- 114_operator_segment.sql — Segmento do operador (passeios/transfers OU vagas)
-- =============================================================================
-- Um app de operador só, com o menu adaptado ao login. Cada operador atua em UM
-- segmento exclusivo: 'tours_transfers' (passeios + translados, comportamento
-- atual) ou 'parking' (estacionamento). Admin continua vendo tudo.
--
-- Default 'tours_transfers' para não mudar nada dos operadores existentes.
-- Idempotente.
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS operator_segment TEXT NOT NULL DEFAULT 'tours_transfers';
DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT chk_users_operator_segment
    CHECK (operator_segment IN ('tours_transfers','parking'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'users' AND column_name = 'operator_segment';
*/
