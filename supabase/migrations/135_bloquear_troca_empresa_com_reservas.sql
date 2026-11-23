-- 135: Protege o historico de reservas ao vincular/desvincular um operador.
--
-- O relatorio da empresa atualmente filtra bookings pelo company_id ATUAL do
-- usuario operador. Transferir ou desvincular quem ja possui bookings faria o
-- historico sumir da empresa anterior e aparecer na nova empresa.
--
-- Medida fail-closed ate que as reservas tenham snapshot da empresa de origem:
-- proibir qualquer mudanca de users.company_id se ja houver bookings para esse
-- usuario (inclusive reservas ainda nao pagas).
--
-- Criar um operador novo e vincula-lo, editar dados da equipe, bloquear,
-- remover logicamente (company_removed_at) e renovar senhas continuam liberados.
-- Nao altera linhas existentes de usuarios, reservas ou pagamentos.
--
-- A funcao e SECURITY INVOKER e usa nomes qualificados (search_path vazio).

CREATE OR REPLACE FUNCTION public.prevent_company_change_with_booking_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $guard$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     AND EXISTS (
       SELECT 1
       FROM public.bookings b
       WHERE b.operator_id = OLD.id
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'users_company_booking_history_guard',
      MESSAGE = 'Operador possui reservas anteriores: nao e seguro mudar o vinculo de empresa sem preservar o historico';
  END IF;
  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS users_company_booking_history_guard ON public.users;
CREATE TRIGGER users_company_booking_history_guard
BEFORE UPDATE OF company_id ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_company_change_with_booking_history();

COMMENT ON FUNCTION public.prevent_company_change_with_booking_history() IS
  'Bloqueia mudancas de company_id quando o usuario possui reservas com operator_id: evita reatribuicao indevida de historico entre empresas.';

-- Confirma que a protecao foi instalada. Nao le nem altera reservas.
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='users'
      AND t.tgname='users_company_booking_history_guard'
      AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
  ) THEN
    RAISE EXCEPTION 'Protecao de historico de empresa nao instalada';
  END IF;
END;
$check$;
