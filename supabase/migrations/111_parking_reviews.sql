-- =============================================================================
-- 111_parking_reviews.sql — Avaliação do estacionamento (fase 8)
-- =============================================================================
-- Uma avaliação por reserva concluída (nota 1–5 + comentário opcional). Domínio
-- próprio do estacionamento (não mistura com as reviews de passeio/translado).
-- RLS habilitada e SEM policies (só a API, igual ao resto). Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS parking_reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL UNIQUE REFERENCES parking_reservations(id) ON DELETE CASCADE,
  lot_id         UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parking_reviews_lot ON parking_reviews (lot_id, created_at DESC);

ALTER TABLE parking_reviews ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT table_name FROM information_schema.tables WHERE table_name = 'parking_reviews';
*/
