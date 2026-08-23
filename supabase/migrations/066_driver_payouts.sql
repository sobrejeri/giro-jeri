-- =============================================================================
-- 066_driver_payouts.sql — Controle de repasse ao motorista
-- =============================================================================
-- Quando a plataforma opera as corridas (operador da casa, sem Mercado Pago
-- conectado), o dinheiro cai 100% na conta da plataforma e o pagamento ao
-- motorista é feito FORA do sistema (PIX, dinheiro). Faltava onde registrar
-- quanto cada motorista tem a receber e se já foi pago.
--
-- Guardamos no próprio `operational_assignments`, que já é o registro do
-- despacho — tem o motorista (driver_name/driver_phone, migration 017), o
-- veículo (real_vehicle_text) e o vínculo com a reserva (data e valor do
-- serviço). Uma tabela paralela só criaria risco de divergir do despacho.
-- =============================================================================

ALTER TABLE operational_assignments
  ADD COLUMN IF NOT EXISTS driver_payout_amount  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS driver_payout_status  TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS driver_paid_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS driver_payout_notes   TEXT;

-- Estados possíveis. 'cancelled' cobre corrida cancelada/despacho desfeito,
-- para o valor sair do "a pagar" sem apagar o histórico.
DO $$
BEGIN
  ALTER TABLE operational_assignments
    ADD CONSTRAINT operational_assignments_payout_status_chk
    CHECK (driver_payout_status IN ('pending', 'paid', 'cancelled'));
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- já existe: migration reexecutada
END $$;

-- Listagem do admin filtra por status e ordena por data — sem índice isso
-- vira varredura na tabela inteira conforme o volume cresce.
CREATE INDEX IF NOT EXISTS operational_assignments_payout_idx
  ON operational_assignments (driver_payout_status, created_at DESC);

COMMENT ON COLUMN operational_assignments.driver_payout_amount IS
  'Valor combinado com o motorista por esta corrida. NULL = ainda não definido.';
COMMENT ON COLUMN operational_assignments.driver_payout_status IS
  'pending = a pagar · paid = repassado (fora da plataforma) · cancelled = não devido';
COMMENT ON COLUMN operational_assignments.driver_payout_notes IS
  'Como foi pago (PIX, dinheiro), comprovante ou observação do repasse.';
