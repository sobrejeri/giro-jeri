-- =============================================================================
-- 116_parking_change_requests.sql — Alteração de período com aprovação (fase D)
-- =============================================================================
-- O cliente PEDE a prorrogação (sem pagar); o operador APROVA (revalidando a
-- vaga); então o cliente PAGA a diferença e a extensão é aplicada (reusa
-- parking_apply_extension). Fluxo análogo ao aceite da reserva.
--
-- Preço é sempre do servidor (fotografado no pedido). Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS parking_change_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES parking_reservations(id) ON DELETE CASCADE,
  new_end_at     TIMESTAMPTZ NOT NULL,
  new_units      INTEGER NOT NULL,
  new_total      NUMERIC(10,2) NOT NULL,
  delta          NUMERIC(10,2) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','paid','expired','cancelled')),
  decided_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No máximo um pedido ATIVO (pending/approved) por reserva.
CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_change_active
  ON parking_change_requests (reservation_id) WHERE status IN ('pending','approved');
CREATE INDEX IF NOT EXISTS idx_parking_change_res ON parking_change_requests (reservation_id, created_at DESC);

ALTER TABLE parking_change_requests ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT table_name FROM information_schema.tables WHERE table_name = 'parking_change_requests';
*/
