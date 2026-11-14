-- =============================================================================
-- 133_comissao_do_vendedor.sql — o que a EMPRESA paga ao operador que VENDEU
-- =============================================================================
-- A empresa define, no cadastro de cada operador da equipe, o percentual que
-- ele ganha sobre o valor das reservas que vende. A comissão da plataforma
-- continua indo para a EMPRESA (129); isto aqui é o acerto INTERNO da empresa
-- com o operador — pago por fora, com baixa manual, igual ao repasse de quem
-- executa.
--
--   users.company_commission_pct    percentual do operador (NULL = não definido)
--   users.company_commission_since  desde quando esse percentual vale. Só
--                                   reservas criadas a partir daí geram
--                                   comissão — definir o percentual hoje não
--                                   cria dívida sobre vendas antigas.
--   company_seller_payouts          uma linha por reserva paga, com a FOTO do
--                                   percentual e do valor na hora em que nasceu.
--
-- Depende da 129. Idempotente.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_commission_pct   numeric(5,2),
  ADD COLUMN IF NOT EXISTS company_commission_since timestamptz;

DO $$
BEGIN
  ALTER TABLE public.users ADD CONSTRAINT users_company_commission_pct_chk
    CHECK (company_commission_pct IS NULL OR (company_commission_pct >= 0 AND company_commission_pct <= 100));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.company_seller_payouts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  operator_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  booking_id  uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  base_amount numeric(10,2) NOT NULL,
  pct         numeric(5,2)  NOT NULL,
  amount      numeric(10,2) NOT NULL,
  status      text NOT NULL DEFAULT 'pending',
  paid_at     timestamptz,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Uma comissão de venda por reserva: é o que impede lançar em dobro.
  CONSTRAINT company_seller_payouts_unico UNIQUE (booking_id),
  CONSTRAINT company_seller_payouts_status_chk CHECK (status IN ('pending', 'paid', 'cancelled')),
  CONSTRAINT company_seller_payouts_valor_chk  CHECK (amount >= 0 AND base_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_company_seller_payouts_empresa
  ON public.company_seller_payouts (company_id, status, created_at DESC);

-- Só a API (service role) lê e escreve.
ALTER TABLE public.company_seller_payouts ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
