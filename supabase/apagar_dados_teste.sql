-- ════════════════════════════════════════════════════════════════════════
--  APAGAR DADOS DE TESTE — solicitações/reservas (passeios, transfers) +
--  estacionamento. NÃO mexe em catálogo, usuários, regiões nem configuração.
-- ════════════════════════════════════════════════════════════════════════
--
--  ⚠️  DESTRUTIVO E IRREVERSÍVEL depois do COMMIT. Rode no Supabase (SQL Editor).
--      Use só enquanto a plataforma ainda é toda de teste (pré-lançamento).
--
--  O QUE É APAGADO (dados transacionais):
--    • Passeios/transfers: bookings e tudo que depende deles — payments,
--      payment_events, commissions, operational_assignments, reviews,
--      financial_ledger, coupon_redemptions (zera o uso dos cupons de teste),
--      booking_payouts, transfer_quotes, e por CASCADE: booking_items,
--      booking_vehicles, booking_legs, booking_messages.
--    • Estacionamento: parking_reservations e, por CASCADE, parking_payments,
--      parking_withdrawals, parking_reviews, parking_change_requests e os
--      bloqueios de capacidade LIGADOS a reservas; mais parking_stays
--      (inclui as estadias walk-in de teste).
--
--  O QUE É PRESERVADO (catálogo + config + cadastros):
--    • tours, service_modals, vehicles, rotas, cupons (as DEFINIÇÕES),
--      users, regiões/municípios, settings, pátios de estacionamento,
--      preços e os bloqueios de capacidade MANUAIS (reservation_id NULL).
--
--  A ordem de exclusão respeita as FKs: os filhos RESTRICT de bookings
--  (payments, commissions, operational_assignments, reviews) saem ANTES de
--  bookings; o resto é CASCADE/SET NULL. Verificado contra as migrações.
-- ════════════════════════════════════════════════════════════════════════


-- ─── 1) PRÉVIA (opcional) ────────────────────────────────────────────────
-- Rode SÓ este bloco primeiro para ver quanto será apagado. É só leitura.
SELECT 'bookings'               AS tabela, count(*) FROM bookings
UNION ALL SELECT 'payments',                 count(*) FROM payments
UNION ALL SELECT 'commissions',              count(*) FROM commissions
UNION ALL SELECT 'operational_assignments',  count(*) FROM operational_assignments
UNION ALL SELECT 'reviews',                  count(*) FROM reviews
UNION ALL SELECT 'financial_ledger',         count(*) FROM financial_ledger
UNION ALL SELECT 'coupon_redemptions',       count(*) FROM coupon_redemptions
UNION ALL SELECT 'booking_payouts',          count(*) FROM booking_payouts
UNION ALL SELECT 'transfer_quotes',          count(*) FROM transfer_quotes
UNION ALL SELECT 'parking_reservations',     count(*) FROM parking_reservations
UNION ALL SELECT 'parking_stays',            count(*) FROM parking_stays;


-- ─── 2) EXCLUSÃO (a parte destrutiva) ────────────────────────────────────
-- Tudo dentro de uma transação: se qualquer linha falhar, NADA é apagado.
BEGIN;

  -- Passeios / transfers ---------------------------------------------------
  DELETE FROM payment_events;          -- cascata de payments; explícito p/ clareza
  DELETE FROM payments;                -- RESTRICT em bookings → sai antes
  DELETE FROM commissions;             -- RESTRICT
  DELETE FROM operational_assignments; -- RESTRICT
  DELETE FROM reviews;                 -- RESTRICT
  DELETE FROM financial_ledger;        -- SET NULL (senão sobra órfão no financeiro)
  DELETE FROM coupon_redemptions;      -- SET NULL (reseta o uso dos cupons de teste)
  DELETE FROM booking_payouts;         -- CASCADE; explícito p/ clareza
  DELETE FROM transfer_quotes;         -- SET NULL
  DELETE FROM bookings;                -- leva por CASCADE: booking_items,
                                       -- booking_vehicles, booking_legs, booking_messages

  -- Estacionamento ---------------------------------------------------------
  DELETE FROM parking_stays;           -- SET NULL p/ reserva (inclui walk-ins de teste)
  DELETE FROM parking_reservations;    -- CASCADE: capacity_blocks(da reserva),
                                       -- payments, withdrawals, reviews, change_requests

  -- Conferência pós-exclusão (tudo deve dar 0) -----------------------------
  SELECT 'bookings'            AS tabela, count(*) FROM bookings
  UNION ALL SELECT 'payments',              count(*) FROM payments
  UNION ALL SELECT 'parking_reservations',  count(*) FROM parking_reservations
  UNION ALL SELECT 'parking_stays',         count(*) FROM parking_stays
  UNION ALL SELECT 'financial_ledger',      count(*) FROM financial_ledger;

-- Se os números acima estiverem certos (zeros), confirme:
COMMIT;
-- Deu algo errado? Troque o COMMIT por ROLLBACK e nada é apagado.
