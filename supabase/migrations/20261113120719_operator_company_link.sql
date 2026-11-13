-- Rascunho para o vínculo: não aplicar antes da integração de recebimentos,
-- das políticas RLS e dos testes de histórico e isolamento entre empresas.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS company_role public.user_type
    GENERATED ALWAYS AS ('company'::public.user_type) STORED;

ALTER TABLE public.users
  ADD CONSTRAINT users_id_user_type_unique UNIQUE (id, user_type),
  ADD CONSTRAINT users_company_only_for_operator
    CHECK (company_id IS NULL OR user_type = 'operator'),
  ADD CONSTRAINT users_company_must_be_company
    FOREIGN KEY (company_id, company_role) REFERENCES public.users (id, user_type);

CREATE INDEX users_company_id_idx ON public.users (company_id) WHERE company_id IS NOT NULL;

-- O operador vinculado mantém seu perfil pessoal, mas a conta de recebimento
-- é mantida na empresa. Não altere o destino de pagamentos já existentes.
CREATE FUNCTION public.protect_linked_operator_receiving_account()
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

CREATE TRIGGER users_protect_linked_receiving_account
BEFORE UPDATE OF pix_key_type, pix_key, bank_name, bank_agency,
  bank_account_number, bank_account_type, bank_document, recipient_kyc
ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_linked_operator_receiving_account();
