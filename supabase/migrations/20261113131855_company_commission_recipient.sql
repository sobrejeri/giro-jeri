ALTER TABLE public.booking_payouts
  ADD COLUMN origin_operator_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.booking_payouts.origin_operator_id IS
  'Operador que originou a comissão atribuída à empresa na criação do repasse.';

CREATE FUNCTION public.assign_company_commission_recipient()
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

CREATE TRIGGER booking_payout_company_commission
BEFORE INSERT ON public.booking_payouts
FOR EACH ROW EXECUTE FUNCTION public.assign_company_commission_recipient();
