-- =============================================================================
-- 060_coop_reviews.sql — Avaliações REAIS por cooperativa
-- =============================================================================
-- A tabela reviews (001) já garante avaliação VERIFICADA: 1 por reserva
-- (UNIQUE booking_id), nota 1-5 e comentário. Esta migration adiciona o alvo
-- de reputação: a COOPERATIVA que executou (operator_id, desnormalizado da
-- reserva para consultas públicas rápidas), índices e leitura pública.
-- Aditiva e idempotente.
-- =============================================================================

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Backfill: avaliações existentes herdam a coop da reserva.
UPDATE reviews r
SET operator_id = b.operator_id
FROM bookings b
WHERE b.id = r.booking_id
  AND r.operator_id IS NULL
  AND b.operator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_operator
  ON reviews (operator_id, is_public) WHERE operator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_public_recent
  ON reviews (is_public, created_at DESC);

-- Leitura pública das avaliações publicadas (o RLS da 001 só cobria o dono).
DROP POLICY IF EXISTS "reviews_public_read" ON reviews;
CREATE POLICY "reviews_public_read" ON reviews
  FOR SELECT USING (is_public = TRUE);

COMMENT ON COLUMN reviews.operator_id IS
  'Cooperativa que executou a reserva avaliada (reputação por coop). Copiado de bookings no momento da avaliação.';

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='reviews' AND column_name='operator_id';
