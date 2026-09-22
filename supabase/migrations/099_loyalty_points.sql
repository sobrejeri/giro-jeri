-- 099 — Programa de fidelidade (pontos Turiva)
-- Livro-razão de pontos por usuário. Saldo = SOMA de points. Ganha pontos ao
-- pagar uma reserva (1 ponto por R$ 1). Dedupe por (kind, ref): cada reserva
-- credita uma vez só, mesmo com webhook + polling.

CREATE TABLE IF NOT EXISTS loyalty_points (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points      INTEGER NOT NULL,           -- positivo = ganho, negativo = resgate
  kind        TEXT    NOT NULL,           -- 'earn_booking' | 'redeem' | 'adjust'
  ref         TEXT,                        -- ex.: booking_id
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um crédito por (usuário, tipo, referência) — evita pontuar a mesma reserva 2x.
CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_kind_ref
  ON loyalty_points (user_id, kind, ref) WHERE ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loyalty_user ON loyalty_points (user_id, created_at DESC);

ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
