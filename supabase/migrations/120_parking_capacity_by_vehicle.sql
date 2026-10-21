-- =============================================================================
-- 120_parking_capacity_by_vehicle.sql — Capacidade (vagas) por tipo de veículo
-- =============================================================================
-- Até aqui a capacidade do estacionamento era um número único (parking_lots.
-- capacity), conferido como PICO de ocupação no intervalo, sem olhar o tipo de
-- veículo. Agora cada tarifa (parking_tariffs: uma por lot+tipo) pode ter sua
-- própria quantidade de vagas. Quando a tarifa do tipo tem `capacity` definido,
-- a checagem anti-overbooking conta SÓ os blocos daquele tipo contra esse
-- limite; quando é NULL, cai no comportamento antigo (todos os blocos contra o
-- total do lot). Isso torna a mudança retrocompatível: lot sem capacidade por
-- tipo continua exatamente como antes.
--
-- Os blocos (parking_capacity_blocks) já guardam vehicle_type desde a fundação,
-- então o corte por tipo é só um filtro a mais. Idempotente (CREATE OR REPLACE).
-- =============================================================================

-- 1. Coluna de vagas por tipo (NULL = sem limite por tipo; usa o total do lot).
ALTER TABLE parking_tariffs ADD COLUMN IF NOT EXISTS capacity integer;

-- =============================================================================
-- 2. Aceite atômico (substitui 108) — agora com capacidade por tipo.
-- =============================================================================
CREATE OR REPLACE FUNCTION parking_accept_reservation(
  p_reservation_id uuid,
  p_actor          uuid,
  p_is_admin       boolean
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r          parking_reservations%ROWTYPE;
  v_lot      parking_lots%ROWTYPE;
  v_type_cap integer;
  v_cap      integer;
  v_pico     integer;
  v_block    uuid;
  v_deadline timestamptz;
  v_updated  integer;
BEGIN
  SELECT * INTO r FROM parking_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT * INTO v_lot FROM parking_lots WHERE id = r.lot_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lot_not_found');
  END IF;

  IF (NOT p_is_admin) AND v_lot.owner_user_id <> p_actor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF r.status <> 'awaiting_partner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_state', 'status', r.status);
  END IF;

  -- Serializa aceites concorrentes DESTE estacionamento até o fim da transação.
  PERFORM pg_advisory_xact_lock(hashtext(r.lot_id::text));

  -- Capacidade do TIPO, se configurada; senão NULL → usa o total do lot.
  SELECT capacity INTO v_type_cap
    FROM parking_tariffs
   WHERE lot_id = r.lot_id AND vehicle_type = r.vehicle_type
     AND is_active = true AND capacity IS NOT NULL
   LIMIT 1;
  v_cap := COALESCE(v_type_cap, v_lot.capacity);

  -- Pico de ocupação no intervalo pedido. Com capacidade por tipo, conta só os
  -- blocos DAQUELE tipo; senão conta todos (capacidade total do lot).
  WITH ativos AS (
    SELECT start_at, end_at, qty
      FROM parking_capacity_blocks
     WHERE lot_id = r.lot_id
       AND status = 'active'
       AND (kind = 'confirmed' OR (kind = 'temp_hold' AND (expires_at IS NULL OR expires_at > now())) OR kind = 'admin')
       AND (v_type_cap IS NULL OR vehicle_type = r.vehicle_type)
       AND start_at < r.end_at
       AND end_at   > r.start_at
  ),
  pontos AS (
    SELECT r.start_at AS t
    UNION
    SELECT start_at FROM ativos WHERE start_at > r.start_at AND start_at < r.end_at
  ),
  ocup AS (
    SELECT COALESCE((SELECT sum(a.qty) FROM ativos a WHERE a.start_at <= p.t AND p.t < a.end_at), 0) AS c
      FROM pontos p
  )
  SELECT COALESCE(max(c), 0) INTO v_pico FROM ocup;

  IF v_pico + 1 > v_cap THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_capacity', 'pico', v_pico, 'capacity', v_cap);
  END IF;

  v_deadline := now() + make_interval(mins => v_lot.payment_deadline_min);

  INSERT INTO parking_capacity_blocks (lot_id, reservation_id, kind, vehicle_type, start_at, end_at, qty, status, expires_at)
  VALUES (r.lot_id, r.id, 'temp_hold', r.vehicle_type, r.start_at, r.end_at, 1, 'active', v_deadline)
  RETURNING id INTO v_block;

  UPDATE parking_reservations
     SET status = 'accepted_awaiting_payment',
         payment_status = 'pending',
         accepted_at = now(),
         payment_deadline_at = v_deadline,
         updated_at = now()
   WHERE id = r.id AND status = 'awaiting_partner';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    DELETE FROM parking_capacity_blocks WHERE id = v_block;
    RETURN jsonb_build_object('ok', false, 'error', 'bad_state');
  END IF;

  RETURN jsonb_build_object('ok', true, 'block_id', v_block, 'payment_deadline_at', v_deadline);
END $$;

-- =============================================================================
-- 3. Entrada presencial / walk-in (substitui 115) — capacidade por tipo.
-- =============================================================================
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
  v_lot      parking_lots%ROWTYPE;
  v_type_cap integer;
  v_cap      integer;
  v_pico     integer;
  v_block    uuid;
  v_stay     uuid;
BEGIN
  SELECT * INTO v_lot FROM parking_lots WHERE id = p_lot_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'lot_not_found'); END IF;
  IF p_end <= p_start THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_window'); END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_lot_id::text));

  SELECT capacity INTO v_type_cap
    FROM parking_tariffs
   WHERE lot_id = p_lot_id AND vehicle_type = p_vehicle_type
     AND is_active = true AND capacity IS NOT NULL
   LIMIT 1;
  v_cap := COALESCE(v_type_cap, v_lot.capacity);

  WITH ativos AS (
    SELECT start_at, end_at, qty FROM parking_capacity_blocks
     WHERE lot_id = p_lot_id AND status = 'active'
       AND (kind = 'confirmed' OR (kind = 'temp_hold' AND (expires_at IS NULL OR expires_at > now())) OR kind = 'admin')
       AND (v_type_cap IS NULL OR vehicle_type = p_vehicle_type)
       AND start_at < p_end AND end_at > p_start
  ),
  pontos AS (
    SELECT p_start AS t UNION SELECT start_at FROM ativos WHERE start_at > p_start AND start_at < p_end
  ),
  ocup AS (
    SELECT COALESCE((SELECT sum(a.qty) FROM ativos a WHERE a.start_at <= p.t AND p.t < a.end_at), 0) AS c FROM pontos p
  )
  SELECT COALESCE(max(c), 0) INTO v_pico FROM ocup;

  IF v_pico + 1 > v_cap THEN
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
-- 4. Extensão de estadia (substitui 112) — capacidade por tipo.
-- =============================================================================
CREATE OR REPLACE FUNCTION parking_apply_extension(
  p_reservation_id uuid,
  p_new_end_at     timestamptz,
  p_new_units      integer,
  p_new_total      numeric
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r          parking_reservations%ROWTYPE;
  v_lot      parking_lots%ROWTYPE;
  v_type_cap integer;
  v_cap      integer;
  v_pico     integer;
BEGIN
  SELECT * INTO r FROM parking_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF r.status NOT IN ('confirmed','in_lot') OR r.payment_status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_state', 'status', r.status);
  END IF;
  IF p_new_end_at <= r.end_at THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  SELECT * INTO v_lot FROM parking_lots WHERE id = r.lot_id;
  PERFORM pg_advisory_xact_lock(hashtext(r.lot_id::text));

  SELECT capacity INTO v_type_cap
    FROM parking_tariffs
   WHERE lot_id = r.lot_id AND vehicle_type = r.vehicle_type
     AND is_active = true AND capacity IS NOT NULL
   LIMIT 1;
  v_cap := COALESCE(v_type_cap, v_lot.capacity);

  -- Pico de ocupação no NOVO intervalo, excluindo os blocos desta reserva.
  WITH ativos AS (
    SELECT start_at, end_at, qty
      FROM parking_capacity_blocks
     WHERE lot_id = r.lot_id AND status = 'active'
       AND reservation_id IS DISTINCT FROM r.id
       AND (kind = 'confirmed' OR (kind = 'temp_hold' AND (expires_at IS NULL OR expires_at > now())) OR kind = 'admin')
       AND (v_type_cap IS NULL OR vehicle_type = r.vehicle_type)
       AND start_at < p_new_end_at AND end_at > r.start_at
  ),
  pontos AS (
    SELECT r.start_at AS t
    UNION SELECT start_at FROM ativos WHERE start_at > r.start_at AND start_at < p_new_end_at
  ),
  ocup AS (
    SELECT COALESCE((SELECT sum(a.qty) FROM ativos a WHERE a.start_at <= p.t AND p.t < a.end_at), 0) AS c
      FROM pontos p
  )
  SELECT COALESCE(max(c), 0) INTO v_pico FROM ocup;

  IF v_pico + 1 > v_cap THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_capacity');
  END IF;

  -- Cresce o bloqueio confirmado desta reserva até o novo fim.
  UPDATE parking_capacity_blocks SET end_at = p_new_end_at
   WHERE reservation_id = r.id AND status = 'active' AND kind = 'confirmed';

  UPDATE parking_reservations
     SET end_at = p_new_end_at, units = p_new_units, total_amount = p_new_total, updated_at = now()
   WHERE id = r.id;

  RETURN jsonb_build_object('ok', true);
END $$;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
-- Espera ver a coluna e as 3 funções recriadas.
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'parking_tariffs' AND column_name = 'capacity';
--   SELECT proname FROM pg_proc
--    WHERE proname IN ('parking_accept_reservation','parking_create_walkin','parking_apply_extension');
