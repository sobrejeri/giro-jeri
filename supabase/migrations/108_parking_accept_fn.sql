-- =============================================================================
-- 108_parking_accept_fn.sql — Aceite atômico do estacionamento (anti-overbooking)
-- =============================================================================
-- O aceite precisa conferir a capacidade E criar o bloqueio na MESMA operação,
-- senão duas aceitações simultâneas consomem a última vaga. Esta função faz
-- isso dentro de uma transação, serializando por estabelecimento com
-- pg_advisory_xact_lock(lot_id). A conta de capacidade é o PICO de ocupação em
-- [start, end) — não a soma de todos os pedidos que cruzam o período.
--
-- Prazos (pagamento/hold) saem da configuração do próprio lot. Idempotente:
-- CREATE OR REPLACE; reexecutar não quebra nada.
-- =============================================================================

CREATE OR REPLACE FUNCTION parking_accept_reservation(
  p_reservation_id uuid,
  p_actor          uuid,
  p_is_admin       boolean
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r         parking_reservations%ROWTYPE;
  v_lot     parking_lots%ROWTYPE;
  v_pico    integer;
  v_block   uuid;
  v_deadline timestamptz;
  v_updated integer;
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

  -- Pico de ocupação no intervalo pedido, somando qty dos blocos ativos
  -- (confirmados + holds não expirados) que sobrepõem [start, end).
  WITH ativos AS (
    SELECT start_at, end_at, qty
      FROM parking_capacity_blocks
     WHERE lot_id = r.lot_id
       AND status = 'active'
       AND (kind = 'confirmed' OR (kind = 'temp_hold' AND (expires_at IS NULL OR expires_at > now())) OR kind = 'admin')
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

  IF v_pico + 1 > v_lot.capacity THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_capacity', 'pico', v_pico, 'capacity', v_lot.capacity);
  END IF;

  v_deadline := now() + make_interval(mins => v_lot.payment_deadline_min);

  INSERT INTO parking_capacity_blocks (lot_id, reservation_id, kind, vehicle_type, start_at, end_at, qty, status, expires_at)
  VALUES (r.lot_id, r.id, 'temp_hold', r.vehicle_type, r.start_at, r.end_at, 1, 'active', v_deadline)
  RETURNING id INTO v_block;

  -- Condicional no estado: se outra transação já aceitou, não refaz (desfaz o
  -- bloqueio recém-criado e retorna bad_state).
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
