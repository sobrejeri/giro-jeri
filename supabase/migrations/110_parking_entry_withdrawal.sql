-- =============================================================================
-- 110_parking_entry_withdrawal.sql — Entrada no pátio + retirada com PIN (fase 7)
-- =============================================================================
-- Fecha o ciclo físico do estacionamento:
--   confirmed → (entrada por código) → in_lot → (retirada com PIN) → completed
--
-- SEGURANÇA DO PIN DE RETIRADA (requisito do spec, seção 9):
--   • código de entrada e PIN de retirada são DIFERENTES e de naturezas
--     distintas: o código de entrada é um identificador operacional (mostrado
--     ao cliente para dar entrada); o PIN de retirada é um SEGREDO de uso único.
--   • o PIN NUNCA é persistido em claro: guardamos apenas o hash salgado
--     (SHA-256 + salt por linha). O valor em claro só existe na resposta ao
--     DONO da reserva, uma vez — nunca ao parceiro, nunca em log/push/URL.
--   • TTL curto (pin_ttl_min do lot) e limite de tentativas (rate-limit) na
--     própria linha; consumo é ATÔMICO (lock + update condicional), então um
--     PIN vale uma vez só mesmo com cliques/chamadas concorrentes.
--
-- A verificação do hash (com o salt) é feita na API; esta função recebe o hash
-- candidato já calculado e faz a comparação + consumo dentro da mesma transação
-- travada, evitando TOCTOU. Idempotente (IF NOT EXISTS / OR REPLACE).
-- =============================================================================

-- ── Código de entrada (operacional, não-secreto) na própria reserva ───────────
ALTER TABLE parking_reservations ADD COLUMN IF NOT EXISTS entry_code TEXT;
ALTER TABLE parking_reservations ADD COLUMN IF NOT EXISTS entered_at TIMESTAMPTZ;
ALTER TABLE parking_reservations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_res_entry_code
  ON parking_reservations (entry_code) WHERE entry_code IS NOT NULL;

-- ── Retiradas: um segredo de uso único por pedido de retirada ─────────────────
CREATE TABLE IF NOT EXISTS parking_withdrawals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES parking_reservations(id) ON DELETE CASCADE,
  pin_hash       TEXT NOT NULL,                    -- SHA-256(pin + salt) — nunca o PIN em claro
  pin_salt       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','consumed','expired','cancelled')),
  attempts       INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts   INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  expires_at     TIMESTAMPTZ NOT NULL,
  consumed_at    TIMESTAMPTZ,
  consumed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No máximo um pedido de retirada ATIVO por reserva.
CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_withdrawal_pending
  ON parking_withdrawals (reservation_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_parking_withdrawal_res
  ON parking_withdrawals (reservation_id, created_at DESC);

ALTER TABLE parking_withdrawals ENABLE ROW LEVEL SECURITY;

-- ── Entrada no pátio: confirmed → in_lot, abre a estadia. Atômico. ────────────
-- p_code é o código de entrada apresentado pelo cliente; o parceiro só consegue
-- dar entrada numa reserva do SEU lot e paga/confirmada.
CREATE OR REPLACE FUNCTION parking_register_entry(
  p_lot_id    uuid,
  p_code      text,
  p_actor     uuid,
  p_spot      text DEFAULT NULL,
  p_plate     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r parking_reservations%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_lot_id::text));

  SELECT * INTO r FROM parking_reservations
   WHERE lot_id = p_lot_id AND entry_code = upper(btrim(p_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF r.status = 'in_lot' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'reservation_id', r.id);
  END IF;

  IF r.status <> 'confirmed' OR r.payment_status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_state', 'status', r.status);
  END IF;

  UPDATE parking_reservations
     SET status = 'in_lot', entered_at = now(), updated_at = now()
   WHERE id = r.id;

  INSERT INTO parking_stays (lot_id, reservation_id, origin, plate, spot, entered_at, entered_by)
  VALUES (r.lot_id, r.id, 'turiva', COALESCE(p_plate, r.plate), p_spot, now(), p_actor)
  ON CONFLICT (reservation_id) WHERE reservation_id IS NOT NULL AND exited_at IS NULL
  DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'reservation_id', r.id, 'code', r.code);
END $$;

-- ── Consumo do PIN de retirada: compara hash + consome + conclui. Atômico. ────
-- Recebe os hashes candidatos (a API calcula SHA-256(pin||salt) para cada salt
-- pendente do lot, porque não sabe qual reserva o cliente está retirando). Uma
-- submissão = um array = UMA tentativa por PIN pendente. Mismatch incrementa
-- tentativas; estouro invalida o PIN.
CREATE OR REPLACE FUNCTION parking_consume_withdrawal(
  p_lot_id           uuid,
  p_candidate_hashes text[],
  p_actor            uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  w parking_withdrawals%ROWTYPE;
  r parking_reservations%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_lot_id::text));

  -- Procura um PIN pendente, do lot certo, que bata com algum hash candidato.
  SELECT w.* INTO w
    FROM parking_withdrawals w
    JOIN parking_reservations rr ON rr.id = w.reservation_id
   WHERE rr.lot_id = p_lot_id
     AND w.status = 'pending'
     AND w.pin_hash = ANY(p_candidate_hashes)
   LIMIT 1;

  IF NOT FOUND THEN
    -- Sem casar: registra UMA tentativa em TODOS os PINs pendentes do lot
    -- (rate-limit), expirando os que estouraram o limite.
    UPDATE parking_withdrawals w
       SET attempts = w.attempts + 1,
           status   = CASE WHEN w.attempts + 1 >= w.max_attempts THEN 'expired' ELSE w.status END
      FROM parking_reservations rr
     WHERE w.reservation_id = rr.id
       AND rr.lot_id = p_lot_id
       AND w.status = 'pending'
       AND w.expires_at > now();
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pin');
  END IF;

  IF w.expires_at <= now() THEN
    UPDATE parking_withdrawals SET status = 'expired' WHERE id = w.id AND status = 'pending';
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  SELECT * INTO r FROM parking_reservations WHERE id = w.reservation_id;
  IF r.status NOT IN ('in_lot','withdrawal_requested','withdrawal_authorized') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_state', 'status', r.status);
  END IF;

  -- Consome o PIN (uso único) + fecha a estadia + conclui a reserva.
  UPDATE parking_withdrawals
     SET status = 'consumed', consumed_at = now(), consumed_by = p_actor
   WHERE id = w.id AND status = 'pending';

  UPDATE parking_stays
     SET exited_at = now(), exited_by = p_actor
   WHERE reservation_id = r.id AND exited_at IS NULL;

  UPDATE parking_capacity_blocks SET status = 'released'
   WHERE reservation_id = r.id AND status = 'active';

  UPDATE parking_reservations
     SET status = 'completed', completed_at = now(), updated_at = now()
   WHERE id = r.id;

  RETURN jsonb_build_object('ok', true, 'reservation_id', r.id, 'code', r.code);
END $$;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'parking_reservations' AND column_name IN ('entry_code','entered_at','completed_at');
SELECT proname FROM pg_proc WHERE proname IN ('parking_register_entry','parking_consume_withdrawal');
*/
