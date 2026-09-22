-- 102 — Janela de prioridade do operador (lojinha do perfil)
-- Quando o cliente reserva pela lojinha de um operador, o pedido nasce no
-- fluxo normal (awaiting_acceptance), mas fica EXCLUSIVO desse operador por
-- alguns segundos (priority_until). Passado o prazo, entra na fila de todos.
-- Diferente do partner_slug (venda direta sem fila): aqui é só prioridade.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS preferred_operator_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS priority_until        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_priority
  ON bookings (preferred_operator_id, priority_until)
  WHERE preferred_operator_id IS NOT NULL;
