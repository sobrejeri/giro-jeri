-- Adiciona coluna operator_id em bookings para o modelo "primeiro a aceitar"
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_operator
  ON bookings(operator_id);

-- Índice parcial para consulta eficiente das corridas disponíveis
CREATE INDEX IF NOT EXISTS idx_bookings_awaiting_dispatch
  ON bookings(status_commercial, status_operational)
  WHERE operator_id IS NULL;
