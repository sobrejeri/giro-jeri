-- =============================================================================
-- 129_empresa_vinculo_e_comissao.sql — OPERADOR vinculado a EMPRESA
-- =============================================================================
-- O admin vincula um operador a uma empresa (users.company_id). A partir daí:
--   • a COMISSÃO das reservas desse operador é devida à EMPRESA — o repasse
--     nasce em nome dela (payee_user_id), guardando qual operador originou
--     (booking_payouts.origin_operator_id). Repasses antigos NÃO mudam;
--   • o operador não cadastra conta de recebimento própria: quem recebe é a
--     empresa, e o banco recusa a troca de PIX/conta de um operador vinculado.
--
-- PRÉ-REQUISITO: o tipo 'company' já existir (rodado SOZINHO, antes):
--   ALTER TYPE public.user_type ADD VALUE IF NOT EXISTS 'company';
--
-- A API e os apps funcionam sem esta migração (só não oferecem o vínculo).
-- Idempotente — pode rodar mais de uma vez. Substitui os dois rascunhos
-- 20261113120719_operator_company_link e 20261113131855_company_commission_recipient.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'user_type' AND e.enumlabel = 'company'
  ) THEN
    RAISE EXCEPTION 'Rode antes, sozinho: ALTER TYPE public.user_type ADD VALUE IF NOT EXISTS ''company'';';
  END IF;
END $$;

-- ── 1) Vínculo ───────────────────────────────────────────────────────────────
-- company_role é uma coluna GERADA, sempre 'company': com ela a chave
-- estrangeira (company_id, company_role) → users (id, user_type) só aceita
-- apontar para um usuário que É empresa — e impede que uma empresa com
-- operadores vinculados mude de tipo ou seja apagada.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS company_role public.user_type
    GENERATED ALWAYS AS ('company'::public.user_type) STORED;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_id_user_type_unique') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_id_user_type_unique UNIQUE (id, user_type);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_company_only_for_operator') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_company_only_for_operator
      CHECK (company_id IS NULL OR user_type = 'operator');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_company_must_be_company') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_company_must_be_company
      FOREIGN KEY (company_id, company_role) REFERENCES public.users (id, user_type);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_company_id_idx
  ON public.users (company_id) WHERE company_id IS NOT NULL;

-- Operador vinculado: a conta de recebimento é a da empresa. O perfil pessoal
-- continua editável; só PIX/conta/KYC ficam travados enquanto houver vínculo.
CREATE OR REPLACE FUNCTION public.protect_linked_operator_receiving_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL AND
    ROW(NEW.pix_key_type, NEW.pix_key, NEW.bank_name, NEW.bank_agency,
        NEW.bank_account_number, NEW.bank_account_type, NEW.bank_document,
        NEW.recipient_kyc)
    IS DISTINCT FROM
    ROW(OLD.pix_key_type, OLD.pix_key, OLD.bank_name, OLD.bank_agency,
        OLD.bank_account_number, OLD.bank_account_type, OLD.bank_document,
        OLD.recipient_kyc)
  THEN
    RAISE EXCEPTION 'A conta de recebimento é administrada pela empresa vinculada'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_protect_linked_receiving_account ON public.users;
CREATE TRIGGER users_protect_linked_receiving_account
BEFORE UPDATE OF pix_key_type, pix_key, bank_name, bank_agency,
  bank_account_number, bank_account_type, bank_document, recipient_kyc
ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_linked_operator_receiving_account();

-- ── 2) Comissão para a empresa ───────────────────────────────────────────────
ALTER TABLE public.booking_payouts
  ADD COLUMN IF NOT EXISTS origin_operator_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.booking_payouts.origin_operator_id IS
  'Operador que originou a comissão atribuída à empresa na criação do repasse.';

CREATE INDEX IF NOT EXISTS idx_booking_payouts_origin_operator
  ON public.booking_payouts (origin_operator_id) WHERE origin_operator_id IS NOT NULL;

-- A troca de beneficiário acontece NA CRIAÇÃO do repasse (foto do vínculo
-- naquele momento). Mudar o vínculo depois não mexe em repasse já criado.
CREATE OR REPLACE FUNCTION public.assign_company_commission_recipient()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  linked_company uuid;
BEGIN
  IF NEW.kind <> 'commission' OR NEW.payee_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT company_id INTO linked_company
  FROM public.users
  WHERE id = NEW.payee_user_id AND user_type = 'operator';

  IF linked_company IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = linked_company AND user_type = 'company' AND is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Empresa beneficiária inativa ou inválida';
  END IF;

  NEW.origin_operator_id := NEW.payee_user_id;
  NEW.payee_user_id := linked_company;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_payout_company_commission ON public.booking_payouts;
CREATE TRIGGER booking_payout_company_commission
BEFORE INSERT ON public.booking_payouts
FOR EACH ROW EXECUTE FUNCTION public.assign_company_commission_recipient();

NOTIFY pgrst, 'reload schema';
