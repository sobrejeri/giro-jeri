-- =============================================================================
-- 080_repasses_por_reserva.sql — O que a plataforma DEVE, por reserva
-- =============================================================================
-- Com a plataforma recebendo 100% (migration 079), o dinheiro entra inteiro na
-- conta dela e os pagamentos a terceiros viram repasses manuais. Faltava o
-- essencial: um lugar que diga QUEM receber, QUANTO e SE já foi pago.
--
-- Sem isso o dono recebe e não tem de onde tirar a lista — teria que recalcular
-- reserva por reserva, na mão, com a comissão de cada categoria.
--
-- Até DOIS repasses por reserva, e por isso uma tabela própria em vez de
-- colunas na reserva:
--   • `commission` — comissão de quem ACEITOU a solicitação;
--   • `execution`  — valor de quem EXECUTOU, quando não é quem aceitou
--                    (executor fixo do modal, ex.: o aéreo é sempre a mesma).
-- Cada um com status independente: dá para pagar a comissão hoje e o executor
-- na semana que vem.
--
-- `operational_assignments.driver_payout_*` (066) continua existindo e é outra
-- coisa: pagamento ao MOTORISTA de uma corrida despachada pela casa. Não se
-- misturam.
-- =============================================================================

CREATE TABLE IF NOT EXISTS booking_payouts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id    UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL,
  amount        NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  status        TEXT NOT NULL DEFAULT 'pending',
  paid_at       TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Um repasse de cada tipo por reserva. É o que torna a geração idempotente:
  -- o webhook do Mercado Pago pode entregar o mesmo evento mais de uma vez, e
  -- sem isto a mesma comissão seria lançada duas vezes — dinheiro pago em
  -- dobro. Mesma lição do razão (ver `ledger_created`, migration 046).
  CONSTRAINT booking_payouts_unico UNIQUE (booking_id, kind)
);

DO $$
BEGIN
  ALTER TABLE booking_payouts ADD CONSTRAINT booking_payouts_kind_chk
    CHECK (kind IN ('commission', 'execution'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE booking_payouts ADD CONSTRAINT booking_payouts_status_chk
    CHECK (status IN ('pending', 'paid', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE booking_payouts IS
  'Repasses que a plataforma deve por reserva, no modelo em que ela recebe '
  '100%% (migration 079). commission = quem aceitou; execution = quem executou.';
COMMENT ON COLUMN booking_payouts.status IS
  'pending = a pagar · paid = já repassado (fora da plataforma) · '
  'cancelled = não devido (reserva cancelada, acerto por fora)';

-- A tela lista "a pagar" por status e data, e agrupa por cooperativa.
CREATE INDEX IF NOT EXISTS idx_booking_payouts_status
  ON booking_payouts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_payouts_payee
  ON booking_payouts (payee_user_id, status);

SELECT create_updated_at_trigger('booking_payouts');

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Admin gerencia. A cooperativa vê SÓ os repasses dela — é o extrato do que
-- tem a receber, e não pode enxergar o de ninguém mais.
--
-- As duas policies nascem juntas de propósito: a 034 criou as de catálogo e
-- esqueceu `categories`, e o erro só apareceu meses depois (072).
ALTER TABLE booking_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_booking_payouts" ON booking_payouts;
CREATE POLICY "admin_all_booking_payouts" ON booking_payouts FOR ALL
  USING      (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'));

DROP POLICY IF EXISTS "operator_read_own_payouts" ON booking_payouts;
CREATE POLICY "operator_read_own_payouts" ON booking_payouts FOR SELECT
  USING (EXISTS (SELECT 1 FROM users u
                  WHERE u.auth_id = auth.uid() AND u.id = booking_payouts.payee_user_id));

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Total a pagar por cooperativa:
SELECT coalesce(u.full_name, '(sem destinatário)') AS quem_recebe,
       p.kind, count(*) AS reservas, sum(p.amount) AS total
  FROM booking_payouts p LEFT JOIN users u ON u.id = p.payee_user_id
 WHERE p.status = 'pending'
 GROUP BY 1, 2 ORDER BY 4 DESC;
*/
