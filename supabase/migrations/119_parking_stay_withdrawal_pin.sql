-- =============================================================================
-- 119_parking_stay_withdrawal_pin.sql — PIN de retirada do walk-in (presencial)
-- =============================================================================
-- Entrada presencial (parking_stays) não tem conta de cliente, então o PIN de
-- retirada é guardado na própria estadia: nunca em claro, só o hash salgado
-- (SHA-256 de "pin:salt"). O PIN em claro é mostrado UMA vez ao operador para
-- repassar ao cliente, e exigido na saída. Idempotente.
-- =============================================================================

ALTER TABLE parking_stays
  ADD COLUMN IF NOT EXISTS withdrawal_pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS withdrawal_pin_salt TEXT;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'parking_stays'
   AND column_name IN ('withdrawal_pin_hash','withdrawal_pin_salt');
*/
