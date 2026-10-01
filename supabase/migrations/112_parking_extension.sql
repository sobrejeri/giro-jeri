-- =============================================================================
-- 112_parking_extension.sql — Extensão de estadia (fase 8)
-- =============================================================================
-- Prorroga uma reserva já confirmada / no pátio: estende a janela, revalida a
-- capacidade no novo intervalo e cresce o bloqueio confirmado — tudo atômico.
-- A diferença de preço é cobrada ANTES pelo backend (gateway); esta função só
-- aplica a extensão depois do pagamento aprovado. Idempotente por natureza:
-- se a janela já cobre new_end, retorna already.
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
  r      parking_reservations%ROWTYPE;
  v_lot  parking_lots%ROWTYPE;
  v_pico integer;
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

  -- Pico de ocupação no NOVO intervalo, excluindo os blocos desta reserva.
  WITH ativos AS (
    SELECT start_at, end_at, qty
      FROM parking_capacity_blocks
     WHERE lot_id = r.lot_id AND status = 'active'
       AND reservation_id IS DISTINCT FROM r.id
       AND (kind = 'confirmed' OR (kind = 'temp_hold' AND (expires_at IS NULL OR expires_at > now())) OR kind = 'admin')
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

  IF v_pico + 1 > v_lot.capacity THEN
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
/*
SELECT proname FROM pg_proc WHERE proname = 'parking_apply_extension';
*/
