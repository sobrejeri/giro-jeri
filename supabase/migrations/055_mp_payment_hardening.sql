-- Mercado Pago: tentativas, diagnóstico e webhook idempotente.
-- A constraint UNIQUE original de gateway_transaction_id permanece intacta.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_attempt_id UUID,
  ADD COLUMN IF NOT EXISTS status_detail VARCHAR(120),
  ADD COLUMN IF NOT EXISTS collector_id VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS payments_payment_attempt_id_key
  ON payments(payment_attempt_id) WHERE payment_attempt_id IS NOT NULL;

ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS gateway_event_id VARCHAR(200);
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_gateway_event_id_key
  ON payment_events(gateway_event_id) WHERE gateway_event_id IS NOT NULL;
