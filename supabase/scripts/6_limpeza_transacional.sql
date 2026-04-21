-- ═══════════════════════════════════════════════════════════════
-- GIRO JERI — Limpeza de Dados Transacionais
-- Remove reservas, pagamentos e dados de teste
-- MANTÉM: region, categories, tours, vehicles, transfers, users admin/operator
-- ⚠  ATENÇÃO: irreversível — use apenas em desenvolvimento
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Dependentes de payments ────────────────────────────────────
DELETE FROM payment_events;

-- ── 2. Dependentes de bookings ────────────────────────────────────
DELETE FROM payments;
DELETE FROM commissions;
DELETE FROM coupon_redemptions;
DELETE FROM financial_ledger;
DELETE FROM operational_assignments;
DELETE FROM booking_items;
DELETE FROM booking_vehicles;
DELETE FROM reviews;

-- ── 3. Raiz das reservas ──────────────────────────────────────────
DELETE FROM bookings;

-- ── 4. Cotações de transfer ───────────────────────────────────────
DELETE FROM transfer_quotes;

-- ── 5. Dados auxiliares sem vínculo ──────────────────────────────
DELETE FROM notifications;
DELETE FROM audit_logs;
DELETE FROM automation_jobs;
DELETE FROM user_addresses;

-- ── 6. Usuários turistas de teste ─────────────────────────────────
DELETE FROM users WHERE user_type = 'tourist';

-- ── Confirma o que ficou ──────────────────────────────────────────
SELECT 'bookings'        AS tabela, COUNT(*) AS total FROM bookings
UNION ALL SELECT 'payments',        COUNT(*) FROM payments
UNION ALL SELECT 'transfer_quotes', COUNT(*) FROM transfer_quotes
UNION ALL SELECT 'users admin+op',  COUNT(*) FROM users WHERE user_type IN ('admin','operator')
UNION ALL SELECT 'tours',           COUNT(*) FROM tours
UNION ALL SELECT 'vehicles',        COUNT(*) FROM vehicles;
