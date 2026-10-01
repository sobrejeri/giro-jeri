-- =============================================================================
-- 113_parking_refund.sql — Política de reembolso no cancelamento (fase 8)
-- =============================================================================
-- Reembolso por ANTECEDÊNCIA, configurável por estacionamento (nada de número
-- mágico no código): cancelou uma reserva PAGA com pelo menos refund_cutoff_min
-- minutos de antecedência da entrada → elegível a reembolso integral; depois
-- disso → sem reembolso. O cancelamento antes de pagar continua livre.
--
-- NÃO transfere dinheiro: só registra a elegibilidade e o valor; o estorno de
-- fato é processado pela equipe/financeiro conforme o combinado da plataforma.
-- Idempotente.
-- =============================================================================

-- Janela (minutos antes da entrada) para reembolso integral. Default 24h.
ALTER TABLE parking_lots ADD COLUMN IF NOT EXISTS refund_cutoff_min INTEGER NOT NULL DEFAULT 1440;

-- Resultado do reembolso na reserva (sem mover dinheiro aqui).
ALTER TABLE parking_reservations ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE parking_reservations ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2);
DO $$ BEGIN
  ALTER TABLE parking_reservations
    ADD CONSTRAINT chk_parking_refund_status
    CHECK (refund_status IN ('none','eligible','denied','processed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'parking_reservations' AND column_name IN ('refund_status','refund_amount');
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'parking_lots' AND column_name = 'refund_cutoff_min';
*/
