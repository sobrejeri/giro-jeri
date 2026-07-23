-- =============================================================
-- GIRO JERI — 039: Reparo do faturamento (ledger)
-- Problemas corrigidos:
--   1. Lançamentos antigos sem effective_date (gráfico ficava "Sem dados")
--   2. Pagamentos aprovados que ficaram SEM lançamento no ledger
--      (Receita bruta/líquida do mês zerada no Dashboard)
-- Idempotente: pode rodar mais de uma vez sem duplicar nada.
-- =============================================================

-- ─── 0. Garante a coluna de controle ─────────────────────────
ALTER TABLE payments ADD COLUMN IF NOT EXISTS ledger_created BOOLEAN DEFAULT FALSE;

-- ─── 1. Preenche effective_date nos lançamentos antigos ──────
UPDATE financial_ledger
SET effective_date = created_at::date
WHERE effective_date IS NULL;

-- ─── 2. Recria lançamentos que faltam (pagamentos aprovados) ─
-- Receita bruta
INSERT INTO financial_ledger
  (booking_id, payment_id, entry_type, description, amount, direction, financial_status, effective_date)
SELECT
  p.booking_id, p.id, 'booking_gross',
  'Receita bruta — ' || COALESCE(b.booking_code, ''),
  p.amount_gross, 'inflow', 'pending',
  COALESCE(p.paid_at::date, p.created_at::date)
FROM payments p
LEFT JOIN bookings b ON b.id = p.booking_id
WHERE p.status = 'approved'
  AND COALESCE(p.amount_gross, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM financial_ledger fl
    WHERE fl.payment_id = p.id AND fl.entry_type = 'booking_gross'
  );

-- Taxa do gateway
INSERT INTO financial_ledger
  (booking_id, payment_id, entry_type, description, amount, direction, financial_status, effective_date)
SELECT
  p.booking_id, p.id, 'gateway_fee',
  'Taxa gateway — ' || COALESCE(b.booking_code, ''),
  CASE WHEN COALESCE(p.gateway_fee_amount, 0) > 0
       THEN p.gateway_fee_amount
       ELSE ROUND(p.amount_gross * 0.035, 2) END,
  'outflow', 'pending',
  COALESCE(p.paid_at::date, p.created_at::date)
FROM payments p
LEFT JOIN bookings b ON b.id = p.booking_id
WHERE p.status = 'approved'
  AND COALESCE(p.amount_gross, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM financial_ledger fl
    WHERE fl.payment_id = p.id AND fl.entry_type = 'gateway_fee'
  );

-- Receita líquida
INSERT INTO financial_ledger
  (booking_id, payment_id, entry_type, description, amount, direction, financial_status, effective_date)
SELECT
  p.booking_id, p.id, 'booking_net',
  'Receita líquida — ' || COALESCE(b.booking_code, ''),
  p.amount_gross - (CASE WHEN COALESCE(p.gateway_fee_amount, 0) > 0
                         THEN p.gateway_fee_amount
                         ELSE ROUND(p.amount_gross * 0.035, 2) END),
  'inflow', 'pending',
  COALESCE(p.paid_at::date, p.created_at::date)
FROM payments p
LEFT JOIN bookings b ON b.id = p.booking_id
WHERE p.status = 'approved'
  AND COALESCE(p.amount_gross, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM financial_ledger fl
    WHERE fl.payment_id = p.id AND fl.entry_type = 'booking_net'
  );

-- ─── 3. Marca os pagamentos como lançados ────────────────────
UPDATE payments p
SET ledger_created = TRUE
WHERE p.status = 'approved'
  AND EXISTS (
    SELECT 1 FROM financial_ledger fl
    WHERE fl.payment_id = p.id AND fl.entry_type = 'booking_gross'
  );

-- ─── 4. Índice para o gráfico ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ledger_effective_date
  ON financial_ledger(effective_date);

-- ─── Verificação ─────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM financial_ledger WHERE effective_date IS NULL)             AS sem_data_efetiva,
  (SELECT COUNT(*) FROM financial_ledger WHERE entry_type = 'booking_gross')       AS lancamentos_brutos,
  (SELECT COALESCE(SUM(amount),0) FROM financial_ledger
     WHERE entry_type = 'booking_gross'
       AND effective_date >= date_trunc('month', CURRENT_DATE))                    AS receita_bruta_mes;
