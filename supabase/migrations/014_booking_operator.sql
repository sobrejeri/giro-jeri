-- Associa uma reserva à cooperativa que aceitou o serviço
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_bookings_operator ON bookings(operator_id);
