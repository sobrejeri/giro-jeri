-- =============================================================================
-- 115_parking_walkin.sql — Entrada presencial (walk-in) cobrada pela plataforma
-- =============================================================================
-- O cliente de balcão não tem conta de usuário, então a reserva (que exige
-- user_id) não serve. O walk-in vive direto em parking_stays (origin='walkin'),
-- e aqui ganha os campos para ENTRAR NO FINANCEIRO/REPASSE como as reservas:
-- dados do cliente, período previsto, valor, comissão e status de pagamento.
--
-- O pagamento presencial é liquidado como 'manual' (dinheiro/pix no balcão) e
-- entra no repasse igual às reservas — sem passar cartão no app. Idempotente.
-- =============================================================================

ALTER TABLE parking_stays ADD COLUMN IF NOT EXISTS client_name     TEXT;
ALTER TABLE parking_stays ADD COLUMN IF NOT EXISTS client_phone    TEXT;
ALTER TABLE parking_stays ADD COLUMN IF NOT EXISTS vehicle_type    TEXT;
ALTER TABLE parking_stays ADD COLUMN IF NOT EXISTS expected_exit_at TIMESTAMPTZ;
ALTER TABLE parking_stays ADD COLUMN IF NOT EXISTS amount          NUMERIC(10,2);
ALTER TABLE parking_stays ADD COLUMN IF NOT EXISTS commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE parking_stays ADD COLUMN IF NOT EXISTS payment_status  TEXT NOT NULL DEFAULT 'none';
-- Liga a estadia de balcão ao seu bloqueio de capacidade (libera na saída).
ALTER TABLE parking_stays ADD COLUMN IF NOT EXISTS capacity_block_id UUID REFERENCES parking_capacity_blocks(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE parking_stays
    ADD CONSTRAINT chk_parking_stays_payment_status
    CHECK (payment_status IN ('none','pending','paid','refunded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_parking_stays_paid
  ON parking_stays (lot_id, payment_status) WHERE origin = 'walkin';

-- Criação atômica do walk-in: confere capacidade no período, cria o bloqueio
-- (visível às reservas, anti-overbooking) e abre a estadia. Serializa por lot.
CREATE OR REPLACE FUNCTION parking_create_walkin(
  p_lot_id         uuid,
  p_actor          uuid,
  p_client_name    text,
  p_client_phone   text,
  p_vehicle_type   text,
  p_plate          text,
  p_spot           text,
  p_start          timestamptz,
  p_end            timestamptz,
  p_amount         numeric,
  p_commission_pct numeric,
  p_payment_status text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_lot   parking_lots%ROWTYPE;
  v_pico  integer;
  v_block uuid;
  v_stay  uuid;
BEGIN
  SELECT * INTO v_lot FROM parking_lots WHERE id = p_lot_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'lot_not_found'); END IF;
  IF p_end <= p_start THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_window'); END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_lot_id::text));

  WITH ativos AS (
    SELECT start_at, end_at, qty FROM parking_capacity_blocks
     WHERE lot_id = p_lot_id AND status = 'active'
       AND (kind = 'confirmed' OR (kind = 'temp_hold' AND (expires_at IS NULL OR expires_at > now())) OR kind = 'admin')
       AND start_at < p_end AND end_at > p_start
  ),
  pontos AS (
    SELECT p_start AS t UNION SELECT start_at FROM ativos WHERE start_at > p_start AND start_at < p_end
  ),
  ocup AS (
    SELECT COALESCE((SELECT sum(a.qty) FROM ativos a WHERE a.start_at <= p.t AND p.t < a.end_at), 0) AS c FROM pontos p
  )
  SELECT COALESCE(max(c), 0) INTO v_pico FROM ocup;

  IF v_pico + 1 > v_lot.capacity THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_capacity');
  END IF;

  INSERT INTO parking_capacity_blocks (lot_id, reservation_id, kind, vehicle_type, start_at, end_at, qty, status)
  VALUES (p_lot_id, NULL, 'confirmed', p_vehicle_type, p_start, p_end, 1, 'active')
  RETURNING id INTO v_block;

  INSERT INTO parking_stays
    (lot_id, reservation_id, origin, plate, spot, vehicle_type, client_name, client_phone,
     entered_at, expected_exit_at, entered_by, amount, commission_pct, payment_status, capacity_block_id)
  VALUES
    (p_lot_id, NULL, 'walkin', p_plate, p_spot, p_vehicle_type, p_client_name, p_client_phone,
     now(), p_end, p_actor, p_amount, p_commission_pct, COALESCE(p_payment_status,'pending'), v_block)
  RETURNING id INTO v_stay;

  RETURN jsonb_build_object('ok', true, 'stay_id', v_stay, 'block_id', v_block);
END $$;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'parking_stays'
   AND column_name IN ('client_name','amount','commission_pct','payment_status');
*/
