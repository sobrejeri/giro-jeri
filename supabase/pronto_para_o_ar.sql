-- ─────────────────────────────────────────────────────────────────────────────
-- Pronto para o ar? — conferência antes de abrir a plataforma
--
-- NÃO É MIGRATION. Só lê — não cria, não altera, não apaga nada.
-- Pode rodar quantas vezes quiser, inclusive com a plataforma no ar.
--
-- Responde três perguntas, nesta ordem:
--   1. O BANCO está completo?      (migrations 071–082)
--   2. A CONFIGURAÇÃO está feita?  (comissões, executor, modais das coops)
--   3. Tem DINHEIRO travado?       (repasse sem destino, reserva sem repasse)
--
-- Cada linha traz o que fazer. "OK" = nada a fazer.
--
-- Por que tudo em SQL dinâmico (EXECUTE): o Postgres analisa a instrução
-- INTEIRA antes de rodar, então um `CASE WHEN to_regclass(...) IS NOT NULL`
-- NÃO protege contra tabela ausente — a consulta falha na análise, antes de o
-- CASE ser avaliado. Já quebrou aqui antes. Com EXECUTE, cada checagem só é
-- analisada se a tabela existir.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS _conferencia;
CREATE TEMP TABLE _conferencia (
  ordem   INT,
  etapa   TEXT,
  item    TEXT,
  status  TEXT,
  o_que_fazer TEXT
);

DO $$
DECLARE
  n INT;
  txt TEXT;
  existe BOOL;
BEGIN
  -- ══ 1. BANCO ═══════════════════════════════════════════════════════════
  -- Cada migration é identificada por algo que só ela cria.
  FOR txt, existe IN
    SELECT * FROM (VALUES
      ('071 · carrossel de categorias',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='categories' AND column_name='is_exclusive')),
      ('073 · modal nos veículos',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='vehicles' AND column_name='modal')),
      ('075 · modais cadastráveis',
       to_regclass('public.service_modals') IS NOT NULL),
      ('077 · operador universal',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='users' AND column_name='accepts_combos')),
      ('078 · executor fixo e comissões',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='service_modals' AND column_name='executor_operator_id')),
      ('080 · controle de repasses',
       to_regclass('public.booking_payouts') IS NOT NULL),
      ('081 · chave PIX de quem executa',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='operational_assignments' AND column_name='driver_pix_key')),
      ('082 · repasse a quem não tem cadastro',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='booking_payouts' AND column_name='payee_name'))
    ) v(a, b)
  LOOP
    INSERT INTO _conferencia VALUES (
      1, '1. Banco', txt,
      CASE WHEN existe THEN 'OK' ELSE '❌ FALTA' END,
      CASE WHEN existe THEN '' ELSE 'Rode a migration correspondente no SQL Editor.' END);
  END LOOP;

  -- ══ 2. CONFIGURAÇÃO ════════════════════════════════════════════════════

  -- 2.1 Para onde vai o dinheiro do cliente.
  IF to_regclass('public.system_settings') IS NOT NULL THEN
    EXECUTE $q$ SELECT coalesce((SELECT setting_value FROM system_settings
                                  WHERE setting_key='payment_platform_receives_all'), 'ausente') $q$
      INTO txt;
    INSERT INTO _conferencia VALUES (
      2, '2. Configuração', 'Plataforma recebe 100% (079)',
      CASE WHEN txt = 'false' THEN '⚠ split ligado' ELSE 'OK' END,
      CASE WHEN txt = 'false'
           THEN 'Está em "false": o pagamento tenta dividir no ato, o que só funciona com PIX. Rode a 079.'
           ELSE '' END);
  END IF;

  -- 2.2 Comissão por categoria. Sem isso o repasse sai pela porcentagem geral.
  IF to_regclass('public.service_modals') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='service_modals'
                    AND column_name='platform_commission_pct') THEN
    EXECUTE $q$ SELECT count(*) FROM service_modals
                 WHERE coalesce(is_active, true) AND platform_commission_pct IS NULL $q$
      INTO n;
    INSERT INTO _conferencia VALUES (
      2, '2. Configuração', 'Comissão definida em cada categoria',
      CASE WHEN n = 0 THEN 'OK' ELSE '⚠ ' || n || ' sem definir' END,
      CASE WHEN n = 0 THEN ''
           ELSE 'Catálogo → Veículos → editar o modal. Sem isso vale a porcentagem geral, '
                'não a da categoria.' END);

    -- 2.3 Quem voa. O aéreo costuma ter executor único.
    EXECUTE $q$ SELECT count(*) FROM service_modals
                 WHERE coalesce(is_active, true) AND executor_operator_id IS NOT NULL $q$
      INTO n;
    INSERT INTO _conferencia VALUES (
      2, '2. Configuração', 'Executor fixo marcado (aéreo)',
      CASE WHEN n > 0 THEN 'OK' ELSE '⚠ nenhum' END,
      CASE WHEN n > 0 THEN ''
           ELSE 'Se o aéreo é sempre a mesma empresa, marque-a como executor fixo do modal aéreo.' END);
  END IF;

  -- 2.4 Quem recebe cada tipo de serviço. Sem linha = recebe tudo (opt-out).
  IF to_regclass('public.operator_service_preferences') IS NOT NULL THEN
    EXECUTE $q$ SELECT count(*) FROM users u
                 WHERE u.user_type = 'operator' AND coalesce(u.is_active, true)
                   AND NOT EXISTS (SELECT 1 FROM operator_service_preferences p
                                    WHERE p.operator_user_id = u.id AND p.entity_type = 'modal') $q$
      INTO n;
    INSERT INTO _conferencia VALUES (
      2, '2. Configuração', 'Cooperativas com categorias definidas',
      CASE WHEN n = 0 THEN 'OK' ELSE '⚠ ' || n || ' sem definir' END,
      CASE WHEN n = 0 THEN ''
           ELSE 'Usuários → cooperativa → frota. Enquanto não definir, ela recebe TODO tipo de '
                'solicitação, inclusive o que não executa.' END);
  END IF;

  -- 2.5 Sem chave PIX o admin não consegue repassar.
  EXECUTE $q$ SELECT count(*) FROM users
               WHERE user_type = 'operator' AND coalesce(is_active, true)
                 AND coalesce(btrim(pix_key), '') = '' $q$
    INTO n;
  INSERT INTO _conferencia VALUES (
    2, '2. Configuração', 'Cooperativas com chave PIX cadastrada',
    CASE WHEN n = 0 THEN 'OK' ELSE '⚠ ' || n || ' sem chave' END,
    CASE WHEN n = 0 THEN ''
         ELSE 'Sem a chave, a tela de repasses mostra o valor mas não para onde mandar.' END);

  -- 2.6 Serviço sem modal não é roteado por categoria.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='categories' AND column_name='modal') THEN
    EXECUTE $q$ SELECT count(*) FROM categories
                 WHERE coalesce(is_active, true) AND coalesce(btrim(modal), '') = '' $q$
      INTO n;
    INSERT INTO _conferencia VALUES (
      2, '2. Configuração', 'Categorias com modal (terrestre/aéreo/aquático)',
      CASE WHEN n = 0 THEN 'OK' ELSE '⚠ ' || n || ' sem modal' END,
      CASE WHEN n = 0 THEN ''
           ELSE 'Categoria sem modal não entra no roteamento por categoria — a solicitação '
                'dela vai para todo mundo.' END);
  END IF;

  -- ══ 3. DINHEIRO ════════════════════════════════════════════════════════

  IF to_regclass('public.booking_payouts') IS NOT NULL THEN
    -- 3.1 Repasse que ninguém consegue pagar.
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='booking_payouts' AND column_name='payee_name') THEN
      EXECUTE $q$ SELECT count(*) FROM booking_payouts
                   WHERE status = 'pending' AND payee_user_id IS NULL
                     AND coalesce(btrim(payee_name), '') = '' $q$
        INTO n;
    ELSE
      EXECUTE $q$ SELECT count(*) FROM booking_payouts
                   WHERE status = 'pending' AND payee_user_id IS NULL $q$
        INTO n;
    END IF;
    INSERT INTO _conferencia VALUES (
      3, '3. Dinheiro', 'Repasses pendentes sem destinatário',
      CASE WHEN n = 0 THEN 'OK' ELSE '⚠ ' || n END,
      CASE WHEN n = 0 THEN '' ELSE 'Resolva pela tela de Repasses antes de acumular mais.' END);

    -- 3.2 Reserva paga que não gerou repasse: dinheiro parado sem lançamento.
    EXECUTE $q$ SELECT count(*) FROM bookings b
                 WHERE b.status_commercial = 'paid' AND b.operator_id IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM booking_payouts p WHERE p.booking_id = b.id) $q$
      INTO n;
    INSERT INTO _conferencia VALUES (
      3, '3. Dinheiro', 'Reservas pagas sem nenhum repasse lançado',
      CASE WHEN n = 0 THEN 'OK' ELSE '⚠ ' || n END,
      CASE WHEN n = 0 THEN ''
           ELSE 'Normal para reservas pagas ANTES da migration 080. Para as novas, indica que '
                'a geração falhou — confira os logs da API.' END);
  END IF;
END $$;

SELECT etapa, item, status, o_que_fazer FROM _conferencia ORDER BY ordem, item;
