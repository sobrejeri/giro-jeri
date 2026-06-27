-- =============================================================
-- GIRO JERI — 037: janela de aceite das solicitações (24h)
--
-- Toda solicitação nasce com 24h para alguma cooperativa aceitar.
-- Expirada a janela: some das telas das cooperativas e passa a aparecer
-- só para o admin, que assume como operador. Solicitações cuja data/hora
-- de serviço já passou são canceladas em definitivo.
-- =============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS acceptance_expires_at TIMESTAMPTZ;

-- Backfill: cada booking ainda aguardando aceite ganha created_at + 24h.
-- Os de mais de 24h ficam imediatamente "expirados" (= visíveis só pro admin),
-- que é exatamente o comportamento desejado depois da migration.
UPDATE bookings
   SET acceptance_expires_at = created_at + INTERVAL '24 hours'
 WHERE acceptance_expires_at IS NULL
   AND status_commercial = 'awaiting_acceptance';

-- Índice para filtrar rapidamente a lista das coops/admin.
CREATE INDEX IF NOT EXISTS idx_bookings_acceptance_window
  ON bookings (status_commercial, acceptance_expires_at)
  WHERE status_commercial = 'awaiting_acceptance';

COMMENT ON COLUMN bookings.acceptance_expires_at IS
  'Prazo (NOW()+24h na criação) para alguma cooperativa aceitar a solicitação. '
  'Expirado: some das telas das coops, passa a aparecer só para o admin.';
