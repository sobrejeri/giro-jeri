-- =============================================================================
-- 049_service_min_advance_hours.sql
-- =============================================================================
-- Antecedência mínima PERSONALIZADA por serviço (horas). O admin define no
-- catálogo; quando NULL, o app usa o padrão (transfer: transfer_min_advance_hours;
-- passeio: cutoff/meio-dia). Aditivo e idempotente.
-- =============================================================================

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS min_advance_hours INT;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS min_advance_hours INT;

COMMENT ON COLUMN tours.min_advance_hours IS
  'Antecedência mínima (horas) para agendar este passeio. NULL = usa o padrão.';
COMMENT ON COLUMN transfers.min_advance_hours IS
  'Antecedência mínima (horas) para agendar este transfer. NULL = usa o padrão.';

-- ── Verificação ──────────────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name IN ('tours','transfers') AND column_name = 'min_advance_hours';
