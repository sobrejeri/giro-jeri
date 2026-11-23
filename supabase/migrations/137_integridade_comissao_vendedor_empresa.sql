-- 137: Integridade de comissoes de vendedor entre empresas.
-- As comissoes sao somente registros de acertos manuais, nao transferencias.
-- Impede que uma comissao nasca para empresa diferente da vinculada ao vendedor,
-- ou para operador diferente do atribuido a reserva.
-- Identificadores company_id/operator_id/booking_id sao imutaveis apos criacao;
-- atualizacao de valor/status/notas para baixa manual permanece permitida.
-- Dependencias: 129, 133, 135 e 136.

CREATE OR REPLACE FUNCTION public.enforce_company_seller_payout_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $body$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.company_id, NEW.operator_id, NEW.booking_id)
       IS DISTINCT FROM ROW(OLD.company_id, OLD.operator_id, OLD.booking_id) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'company_seller_payout_ownership_guard',
        MESSAGE = 'Nao e permitido mudar empresa, vendedor ou reserva de uma comissao ja registrada';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = NEW.operator_id
      AND u.user_type = 'operator'::public.user_type
      AND u.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'company_seller_payout_ownership_guard',
      MESSAGE = 'A empresa da comissao nao corresponde ao vinculo do operador';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = NEW.booking_id
      AND b.operator_id = NEW.operator_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'company_seller_payout_ownership_guard',
      MESSAGE = 'A reserva da comissao nao pertence ao operador vendedor';
  END IF;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS company_seller_payout_ownership_guard ON public.company_seller_payouts;
CREATE TRIGGER company_seller_payout_ownership_guard
BEFORE INSERT OR UPDATE OF company_id, operator_id, booking_id
ON public.company_seller_payouts
FOR EACH ROW EXECUTE FUNCTION public.enforce_company_seller_payout_ownership();

-- A funcao interna nao precisa ser exposta como RPC publica.
REVOKE EXECUTE ON FUNCTION public.enforce_company_seller_payout_ownership()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_company_seller_payout_ownership()
TO service_role;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.company_seller_payouts'::regclass
      AND t.tgname='company_seller_payout_ownership_guard'
      AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
  ) THEN
    RAISE EXCEPTION 'Gatilho de integridade de comissoes nao instalado';
  END IF;
  IF has_function_privilege('anon',
       'public.enforce_company_seller_payout_ownership()','EXECUTE')
     OR has_function_privilege('authenticated',
       'public.enforce_company_seller_payout_ownership()','EXECUTE') THEN
    RAISE EXCEPTION 'RPC de integridade acessivel a usuario publico';
  END IF;
END;
$verify$;
