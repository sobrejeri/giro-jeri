-- 138: Não reescrever o percentual de comissão enquanto ainda existe
-- histórico do vendedor que depende da regra anterior.
--
-- O serviço materializa comissões de reservas PAGAS antes de trocar o
-- percentual. Porém reservas criadas sob a regra antiga e ainda NÃO PAGAS
-- perderiam a comissão quando forem pagas depois da troca: a data
-- company_commission_since seria movida para a data atual.
--
-- Proteção temporária FAIL-CLOSED até haver versionamento histórico de taxas:
-- 1. bloqueia mudança de taxa/data se existir reserva não terminal criada sob
--    a regra antiga;
-- 2. bloqueia também se uma reserva JÁ PAGA desde a taxa antiga ainda não tiver
--    seu registro de comissão materializado na empresa.
--
-- Permite trocar taxas quando toda a carteira estiver liquidada ou cancelada,
-- preservando os lançamentos anteriores. Não movimenta dinheiro.

CREATE OR REPLACE FUNCTION public.guard_company_commission_rate_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $guard$
BEGIN
  IF (NEW.company_commission_pct IS DISTINCT FROM OLD.company_commission_pct
      OR NEW.company_commission_since IS DISTINCT FROM OLD.company_commission_since)
     AND OLD.company_commission_pct > 0
     AND OLD.company_commission_since IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.bookings b
       WHERE b.operator_id = OLD.id
         AND b.created_at >= OLD.company_commission_since
         AND (
           b.status_commercial::text NOT IN ('paid', 'cancelled', 'refunded', 'expired')
           OR (
             b.status_commercial::text = 'paid'
             AND NOT EXISTS (
               SELECT 1
               FROM public.company_seller_payouts p
               WHERE p.booking_id = b.id
                 AND p.operator_id = OLD.id
                 AND p.company_id = OLD.company_id
             )
           )
         )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'users_commission_rate_history_guard',
      MESSAGE = 'Operador possui reservas pendentes ou comissoes antigas nao registradas; preserve o historico antes de alterar o percentual';
  END IF;

  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS users_commission_rate_history_guard ON public.users;
CREATE TRIGGER users_commission_rate_history_guard
BEFORE UPDATE OF company_commission_pct, company_commission_since
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.guard_company_commission_rate_history();

REVOKE EXECUTE ON FUNCTION public.guard_company_commission_rate_history()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_company_commission_rate_history()
  TO service_role;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.users'::regclass
      AND t.tgname = 'users_commission_rate_history_guard'
      AND t.tgenabled IN ('O', 'A') AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Protecao do historico de comissoes nao instalada';
  END IF;
  IF has_function_privilege('anon',
      'public.guard_company_commission_rate_history()','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.guard_company_commission_rate_history()','EXECUTE') THEN
    RAISE EXCEPTION 'Funcao interna de protecao exposta como RPC';
  END IF;
END;
$verify$;
