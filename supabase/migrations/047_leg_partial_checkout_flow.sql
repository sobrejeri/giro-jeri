-- =============================================================================
-- 047_leg_partial_checkout_flow.sql
-- =============================================================================
-- Fluxo de checkout parcial (R3) do motor de pernas:
--   Coop aceita → cliente é notificado → tem uma janela para CONFIRMAR e pagar
--   só o(s) veículo(s) aceito(s), ou cancelar. Passada a janela sem pagamento,
--   uma varredura LAZY (sem cron) cancela a reserva e as pernas e marca como
--   "veículo indisponível — faça nova solicitação".
--
-- Aditivo e seguro (tudo atrás da flag booking_legs_engine_enabled = off):
--   • bookings.payment_deadline_at — prazo do cliente pagar, gravado no 1º
--     aceite. NULL = ainda não houve aceite / não se aplica.
--   • system_settings.leg_payment_window_minutes — janela configurável (min),
--     padrão 15.
--   • índice parcial para a varredura achar reservas vencidas rapidamente.
-- Idempotente.
-- =============================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_deadline_at TIMESTAMPTZ;

COMMENT ON COLUMN bookings.payment_deadline_at IS
  'Motor de pernas (R3): prazo para o cliente pagar após o 1º aceite. Passado '
  'sem pagamento, a varredura lazy cancela a reserva e devolve/expira as pernas.';

INSERT INTO system_settings (setting_key, setting_value, value_type, description)
VALUES (
  'leg_payment_window_minutes', '15', 'number',
  'Minutos que o cliente tem para pagar depois que uma cooperativa aceita (checkout parcial do motor de pernas).'
)
ON CONFLICT (setting_key) DO NOTHING;

-- A varredura lazy busca reservas com prazo vencido ainda pendentes.
CREATE INDEX IF NOT EXISTS idx_bookings_payment_deadline
  ON bookings (payment_deadline_at)
  WHERE payment_deadline_at IS NOT NULL;

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'bookings' AND column_name = 'payment_deadline_at';
--   SELECT setting_value FROM system_settings
--    WHERE setting_key = 'leg_payment_window_minutes';  -- espera '15'
