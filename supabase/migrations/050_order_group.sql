-- =============================================================================
-- 050_order_group.sql
-- =============================================================================
-- Carrinho universal: N reservas, 1 pagamento único.
-- As reservas criadas juntas pelo carrinho compartilham um `order_group_id`;
-- um pagamento pode mirar o GRUPO (carrinho) em vez de uma única reserva.
-- Sem tabela `orders` nova — o grupo é apenas a chave compartilhada.
-- Aditivo e idempotente.
-- =============================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS order_group_id UUID;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS order_group_id UUID;

-- Reservas de um mesmo carrinho: busca por grupo é frequente no checkout/estado.
CREATE INDEX IF NOT EXISTS idx_bookings_order_group
  ON bookings (order_group_id)
  WHERE order_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_order_group
  ON payments (order_group_id)
  WHERE order_group_id IS NOT NULL;

COMMENT ON COLUMN bookings.order_group_id IS
  'Carrinho universal: reservas criadas juntas compartilham este UUID. NULL = reserva avulsa (comportamento legado).';
COMMENT ON COLUMN payments.order_group_id IS
  'Carrinho universal: pagamento único que quita todas as reservas do grupo. NULL = pagamento de reserva única (booking_id).';

-- ── Verificação ──────────────────────────────────────────────────────────────
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE column_name = 'order_group_id' AND table_name IN ('bookings','payments');
