-- =============================================================================
-- 059_featured_routes.sql — Rotas de transfer em destaque na home
-- =============================================================================
-- O carrossel da home vira "Serviços em destaque": além dos passeios
-- (tours.is_featured, já existente), o admin pode destacar ROTAS DEFINIDAS de
-- transfer (ex.: Aeroporto JJD → Jeri). Aditiva e idempotente.
-- =============================================================================

ALTER TABLE transfer_routes
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN transfer_routes.is_featured IS
  'Destaca a rota no carrossel "Serviços em destaque" da home do turista.';

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='transfer_routes' AND column_name='is_featured';
