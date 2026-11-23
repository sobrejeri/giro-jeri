-- 134: bloquear APIs PostgREST privilegiadas para anon/authenticated.
-- As aplicacoes Turiva usam o backend (service_role) para consultas e pagamentos.
-- Nao altera dados, pagamentos, tabelas, formulas de repasse ou funcoes.
-- REVERSAO: conceder SELECT/EXECUTE de volta apenas depois de revisar RLS.
--
-- Importante: revogar tambem de PUBLIC, pois PUBLIC confere privilegios
-- herdados por anon e authenticated, mesmo apos REVOKE especifico.

-- 1) Garantir que as rotas da API continuem podendo executar suas RPCs.
GRANT EXECUTE ON FUNCTION public.claim_payment_approval(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_otp_codes() TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_accepted_legs_before_operator_delete() TO service_role;

-- 2) Impedir chamada direta via /rest/v1/rpc por anon ou autenticado.
REVOKE EXECUTE ON FUNCTION public.claim_payment_approval(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_expired_otp_codes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.requeue_accepted_legs_before_operator_delete() FROM PUBLIC, anon, authenticated;

-- 3) Preservar as leituras do servidor antes de limitar acesso publico.
GRANT SELECT ON TABLE
  public.v_quotes_dashboard,
  public.v_tour_quotes_dashboard,
  public.v_booking_maps_links
TO service_role;

-- 4) Views publicas de cotacao possuem nomes/telefones de clientes
-- e fazem SELECT sobre tabelas protegidas sob privilegios do dono.
REVOKE ALL PRIVILEGES ON TABLE
  public.v_quotes_dashboard,
  public.v_tour_quotes_dashboard,
  public.v_booking_maps_links
FROM PUBLIC, anon, authenticated;

-- 5) Assercoes: aborta se a mitigacao deixou algum acesso indevido.
DO $verify$
DECLARE
  fn regprocedure;
  vw regclass;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.claim_payment_approval(uuid)'::regprocedure,
    'public.purge_expired_otp_codes()'::regprocedure,
    'public.requeue_accepted_legs_before_operator_delete()'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE')
       OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Permissao RPC incorreta: %', fn;
    END IF;
  END LOOP;
  FOREACH vw IN ARRAY ARRAY[
    'public.v_quotes_dashboard'::regclass,
    'public.v_tour_quotes_dashboard'::regclass,
    'public.v_booking_maps_links'::regclass
  ] LOOP
    IF has_table_privilege('anon', vw, 'SELECT')
       OR has_table_privilege('authenticated', vw, 'SELECT')
       OR NOT has_table_privilege('service_role', vw, 'SELECT') THEN
      RAISE EXCEPTION 'Permissao VIEW incorreta: %', vw;
    END IF;
  END LOOP;
END
$verify$;
