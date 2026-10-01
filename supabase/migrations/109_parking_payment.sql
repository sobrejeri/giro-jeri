-- =============================================================================
-- 109_parking_payment.sql — Pagamento individual do estacionamento (fase 4)
-- =============================================================================
-- Tentativas de pagamento por reserva (idempotentes) + confirmação ATÔMICA que
-- transforma o hold temporário em reserva confirmada. A confirmação revalida a
-- capacidade (o hold pode ter expirado entre o aceite e o pagamento) e é
-- idempotente: webhook duplicado / dupla tentativa não confirmam duas vezes.
-- Idempotente (CREATE ... IF NOT EXISTS / OR REPLACE).
-- =============================================================================

CREATE TABLE IF NOT EXISTS parking_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID NOT NULL REFERENCES parking_reservations(id) ON DELETE CASCADE,
  gateway         TEXT NOT NULL,                 -- 'pagarme' | 'mercadopago' | 'manual'
  amount          NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','failed','refunded')),
  external_ref    TEXT,                          -- id do pedido no gateway
  idempotency_key TEXT UNIQUE,                   -- trava reenvio/clique duplo
  raw_response    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parking_payments_res ON parking_payments (reservation_id, created_at DESC);

ALTER TABLE parking_payments ENABLE ROW LEVEL SECURITY;

-- Confirmação atômica: hold → confirmado, revalidando a capacidade. Idempotente.
CREATE OR REPLACE FUNCTION parking_confirm_payment(
  p_reservation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r      parking_reservations%ROWTYPE;
  v_lot  parking_lots%ROWTYPE;
  v_pico integer;
BEGIN
  SELECT * INTO r FROM parking_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Idempotência: já confirmada/paga → sucesso sem refazer.
  IF r.payment_status = 'paid'
     OR r.status IN ('confirmed','in_lot','withdrawal_requested','withdrawal_authorized','completed') THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF r.status <> 'accepted_awaiting_payment' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_state', 'status', r.status);
  END IF;

  SELECT * INTO v_lot FROM parking_lots WHERE id = r.lot_id;

  -- Serializa com os aceites do mesmo estacionamento.
  PERFORM pg_advisory_xact_lock(hashtext(r.lot_id::text));

  -- Pico de ocupação no intervalo, EXCLUINDO os blocos desta própria reserva
  -- (vamos reemitir o confirmado abaixo). Cobre o caso do hold expirado.
  WITH ativos AS (
    SELECT start_at, end_at, qty
      FROM parking_capacity_blocks
     WHERE lot_id = r.lot_id AND status = 'active'
       AND reservation_id IS DISTINCT FROM r.id
       AND (kind = 'confirmed' OR (kind = 'temp_hold' AND (expires_at IS NULL OR expires_at > now())) OR kind = 'admin')
       AND start_at < r.end_at AND end_at > r.start_at
  ),
  pontos AS (
    SELECT r.start_at AS t
    UNION SELECT start_at FROM ativos WHERE start_at > r.start_at AND start_at < r.end_at
  ),
  ocup AS (
    SELECT COALESCE((SELECT sum(a.qty) FROM ativos a WHERE a.start_at <= p.t AND p.t < a.end_at), 0) AS c
      FROM pontos p
  )
  SELECT COALESCE(max(c), 0) INTO v_pico FROM ocup;

  IF v_pico + 1 > v_lot.capacity THEN
    -- Pagou mas a vaga foi comprometida: não confirma. Solta o hold morto e
    -- sinaliza para o tratamento de estorno (não descarta o pagamento).
    UPDATE parking_capacity_blocks SET status = 'released'
      WHERE reservation_id = r.id AND status = 'active';
    RETURN jsonb_build_object('ok', false, 'error', 'no_capacity');
  END IF;

  -- Reemite o bloqueio como CONFIRMADO (solta holds antigos desta reserva).
  UPDATE parking_capacity_blocks SET status = 'released'
    WHERE reservation_id = r.id AND status = 'active';
  INSERT INTO parking_capacity_blocks (lot_id, reservation_id, kind, vehicle_type, start_at, end_at, qty, status)
  VALUES (r.lot_id, r.id, 'confirmed', r.vehicle_type, r.start_at, r.end_at, 1, 'active');

  UPDATE parking_reservations
     SET status = 'confirmed', payment_status = 'paid', updated_at = now()
   WHERE id = r.id;

  RETURN jsonb_build_object('ok', true);
END $$;
