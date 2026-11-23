-- 136: Preservar historico de vendas externas ao mudar o vinculo empresarial.
--
-- A migracao 135 impediu alterar company_id quando o operador possui bookings.
-- Ainda era possivel transferir um operador com SOMENTE vendas externas.
-- O registro externo tem snapshot company_id, mas o relatorio por equipe usa
-- users.company_id atual. A transferencia ocultava o historico da empresa anterior.
--
-- A regra agora considera AMBOS os historicos. Permite primeira vinculacao
-- de operador sem company_id (vendas antigas sem empresa nao sao atribuidas
-- retroativamente). Remocao logica e bloqueio continuam permitidos.
-- O codigo de erro continua 23514 para manter a resposta HTTP 409 do admin.

CREATE OR REPLACE FUNCTION public.prevent_company_change_with_booking_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $guard$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     AND (
       EXISTS (
         SELECT 1 FROM public.bookings b
         WHERE b.operator_id = OLD.id
       )
       OR (
         OLD.company_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM public.external_bookings e
           WHERE e.operator_id = OLD.id
             AND e.company_id = OLD.company_id
         )
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'users_company_booking_history_guard',
      MESSAGE = 'Operador possui reservas anteriores ou vendas externas: preserve o historico antes de mudar a empresa';
  END IF;
  RETURN NEW;
END;
$guard$;

COMMENT ON FUNCTION public.prevent_company_change_with_booking_history() IS
  'Impede troca de company_id quando o operador possui reservas ou vendas externas vinculadas a empresa, preservando historico empresarial.';

-- Verifica o gatilho e as dependencias, sem alterar nenhuma linha existente.
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.users'::regclass
      AND t.tgname = 'users_company_booking_history_guard'
      AND t.tgenabled IN ('O', 'A')
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Gatilho de preservacao do historico nao encontrado';
  END IF;
  IF to_regclass('public.external_bookings') IS NULL THEN
    RAISE EXCEPTION 'Tabela de vendas externas ausente: falta migracao 131';
  END IF;
END;
$assert$;
