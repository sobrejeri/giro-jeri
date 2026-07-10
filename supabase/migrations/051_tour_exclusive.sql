-- =============================================================================
-- 051_tour_exclusive.sql
-- =============================================================================
-- Tipo do passeio: TRADICIONAL (padrão) vs EXCLUSIVO.
--   • Tradicional (is_exclusive = false): entra no carrinho, forma combo, 1
--     pagamento; executado por UMA cooperativa (sem divisão por veículo/perna).
--   • Exclusivo (is_exclusive = true): venda direta, 1 serviço por vez, NÃO vai
--     ao carrinho — vai direto para o "Resumo da reserva".
-- Aditivo e idempotente.
-- =============================================================================

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tours.is_exclusive IS
  'true = passeio exclusivo (venda direta, sem carrinho/combo). false = tradicional (carrinho/combo, 1 cooperativa).';

-- ── Motor de pernas: modelo "reserva inteira, 1 cooperativa" ──────────────────
--   Decisão do produto: tradicionais e exclusivos são aceitos como reserva
--   INTEIRA por uma cooperativa (sem split por veículo). Isso equivale a manter
--   o motor de pernas DESLIGADO. Rode também (fora desta migration, no painel):
--     UPDATE system_settings SET setting_value = 'false'
--      WHERE setting_key = 'booking_legs_engine_enabled';

-- ── Verificação ──────────────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'tours' AND column_name = 'is_exclusive';
