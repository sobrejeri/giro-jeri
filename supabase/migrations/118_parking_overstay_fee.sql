-- =============================================================================
-- 118_parking_overstay_fee.sql — Taxa de excedente (atraso na retirada)
-- =============================================================================
-- O estacionamento define quanto cobra quando o cliente ultrapassa o período
-- reservado, e se cobra por HORA ou por DIA. Uma tolerância opcional (minutos)
-- evita cobrar por poucos minutos de atraso. Valores em centavos (o servidor é
-- sempre a fonte de verdade do preço). Idempotente.
-- =============================================================================

ALTER TABLE parking_lots
  ADD COLUMN IF NOT EXISTS overstay_fee_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overstay_fee_unit  TEXT    NOT NULL DEFAULT 'hour',
  ADD COLUMN IF NOT EXISTS overstay_grace_min INTEGER NOT NULL DEFAULT 0;

-- Unidade de cobrança do excedente: por hora ou por dia.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
     WHERE table_name = 'parking_lots' AND constraint_name = 'parking_lots_overstay_fee_unit_chk'
  ) THEN
    ALTER TABLE parking_lots
      ADD CONSTRAINT parking_lots_overstay_fee_unit_chk
      CHECK (overstay_fee_unit IN ('hour','day'));
  END IF;
END $$;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT column_name, data_type, column_default FROM information_schema.columns
 WHERE table_name = 'parking_lots'
   AND column_name IN ('overstay_fee_cents','overstay_fee_unit','overstay_grace_min');
*/
