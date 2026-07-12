-- =============================================================================
-- 055_affiliate_program.sql
-- =============================================================================
-- Programa de afiliados ("DIVULGOU, GANHOU"): qualquer usuário turista pode
-- ativar seu código/link (/a/<CÓDIGO>) e ganhar comissão sobre reservas PAGAS
-- de quem ele indicou. Regras confirmadas com o usuário:
--
--   • Identificação por código OU link — atribuição vale por 30 dias (cliente).
--   • Comissão gerada automaticamente quando a reserva é paga (% configurável,
--     padrão 5%), com trava anti-autoindicação (na API).
--   • Repasse MANUAL via PIX em até 7 dias (fora do split automático —
--     zero risco no dinheiro da cooperativa). Admin marca como pago.
--
-- O schema 001 já previa o programa: user_type 'affiliate' no enum,
-- bookings.affiliate_id, source_channel 'affiliate_link' e a tabela
-- commissions (affiliate_id, payout_status, payout_due_date). Esta migration
-- só acrescenta o que falta. Aditiva e idempotente (IF NOT EXISTS/ON CONFLICT).
-- =============================================================================

-- ── 1. Código público do afiliado ────────────────────────────────────────────
-- Turista continua turista: virar afiliado é ganhar um código, não trocar o
-- user_type (não quebra nenhum fluxo existente).
ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliate_code VARCHAR(16);

-- Único (case-insensitive) só para quem tem código
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_affiliate_code
  ON users (UPPER(affiliate_code)) WHERE affiliate_code IS NOT NULL;

COMMENT ON COLUMN users.affiliate_code IS
  'Código do programa de afiliados (link /a/<código>). NULL = nunca ativou.';

-- ── 2. Índices de consulta ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_affiliate
  ON bookings (affiliate_id) WHERE affiliate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commissions_affiliate
  ON commissions (affiliate_id) WHERE affiliate_id IS NOT NULL;

-- ── 3. Idempotência da comissão ──────────────────────────────────────────────
-- Webhook + polling podem aprovar o mesmo pagamento quase juntos; a comissão
-- de afiliado é 1 por reserva. O índice único faz o segundo INSERT falhar em
-- silêncio (a API usa ON CONFLICT DO NOTHING).
CREATE UNIQUE INDEX IF NOT EXISTS uq_commissions_booking_affiliate
  ON commissions (booking_id, affiliate_id) WHERE affiliate_id IS NOT NULL;

-- ── 4. Percentual configurável ───────────────────────────────────────────────
INSERT INTO system_settings (setting_key, setting_value, value_type, description)
VALUES ('affiliate_commission_percent', '5', 'number',
        'Percentual de comissão do programa de afiliados sobre o total pago da reserva indicada (repasse manual em até 7 dias).')
ON CONFLICT (setting_key) DO NOTHING;

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='users' AND column_name='affiliate_code';   -- 1 linha
--   SELECT setting_value FROM system_settings
--    WHERE setting_key='affiliate_commission_percent';            -- '5'
