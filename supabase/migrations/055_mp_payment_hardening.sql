-- Mercado Pago: tentativas, diagnóstico e webhook idempotente.
-- A constraint UNIQUE original de gateway_transaction_id permanece intacta.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_attempt_id UUID,
  ADD COLUMN IF NOT EXISTS status_detail VARCHAR(120),
  ADD COLUMN IF NOT EXISTS collector_id VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS payments_payment_attempt_id_key
  ON payments(payment_attempt_id) WHERE payment_attempt_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  gateway_transaction_id VARCHAR(200),
  attempt_status VARCHAR(30) NOT NULL DEFAULT 'processing',
  processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gateway_result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_gateway_transaction_id_key
  ON payment_attempts(gateway_transaction_id) WHERE gateway_transaction_id IS NOT NULL;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS gateway_event_id VARCHAR(200);
ALTER TABLE payment_events ALTER COLUMN payment_id DROP NOT NULL;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS gateway_transaction_id VARCHAR(200);
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_gateway_event_id_key
  ON payment_events(gateway_event_id) WHERE gateway_event_id IS NOT NULL;

-- O webhook pode chegar ANTES do INSERT local. Nesse caso o evento fica gravado
-- com payment_id nulo e é reconciliado depois pelo gateway_transaction_id —
-- este índice é o que torna essa varredura barata a cada pagamento criado.
CREATE INDEX IF NOT EXISTS payment_events_gateway_transaction_id_idx
  ON payment_events(gateway_transaction_id) WHERE gateway_transaction_id IS NOT NULL;

COMMENT ON COLUMN payment_events.payment_id IS
  'Nulo enquanto o evento do gateway chega antes do pagamento local existir; preenchido na reconciliação.';
COMMENT ON COLUMN payment_attempts.attempt_status IS
  'processing = alguém está falando com o gateway; call_failed = a chamada lançou e a tentativa pode ser retomada com a MESMA chave de idempotência; demais valores = status devolvido pelo gateway.';

ALTER TABLE payments ADD COLUMN IF NOT EXISTS approval_claimed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION claim_payment_approval(p_payment_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE payments SET status = 'approved', paid_at = COALESCE(paid_at, NOW()),
    approval_claimed_at = NOW()
  WHERE id = p_payment_id AND approval_claimed_at IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION claim_payment_approval(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_payment_approval(UUID) TO service_role;
