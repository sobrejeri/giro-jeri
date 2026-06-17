-- 021 — Idempotência do ledger financeiro no fluxo de pagamento
-- Adiciona flag `ledger_created` em payments para garantir que onPaymentApproved()
-- não insira lançamentos duplicados quando chamado múltiplas vezes (webhook + polling).

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS ledger_created BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN payments.ledger_created IS
  'TRUE após onPaymentApproved() criar os 3 lançamentos no financial_ledger. '
  'Impede duplicação quando webhook e polling aprovam o mesmo pagamento.';

-- Índice para encontrar pagamentos aprovados ainda sem ledger (uso em job de reconciliação)
CREATE INDEX IF NOT EXISTS idx_payments_ledger_pending
  ON payments (status, ledger_created)
  WHERE status = 'approved' AND ledger_created = FALSE;

-- Verificação
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'payments'
  AND column_name = 'ledger_created';
