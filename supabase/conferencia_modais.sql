-- =============================================================================
-- conferencia_modais.sql — O que já rodou das migrations 072 a 077
-- =============================================================================
-- SÓ LEITURA. Roda a qualquer momento, inclusive no meio da sequência: cada
-- linha diz OK ou FALTA RODAR, e as consultas de dados usam SQL dinâmico para
-- não estourar quando a tabela/coluna ainda não existe (o Postgres valida a
-- consulta inteira antes de executar, então um `to_regclass` no CASE não
-- protege — foi preciso EXECUTE).
--
-- No editor do Supabase, rode TUDO de uma vez: ele mostra o resultado da última
-- consulta, que é justamente o quadro de conferência.
-- =============================================================================

DROP TABLE IF EXISTS _conferencia;
CREATE TEMP TABLE _conferencia (o int, verificacao text, resultado text);

DO $$
DECLARE v text; n int; total text; qtd int;
  temModal  bool := EXISTS (SELECT 1 FROM information_schema.columns
                             WHERE table_name='vehicles' AND column_name='modal');
  temTabela bool := to_regclass('public.service_modals') IS NOT NULL;
BEGIN
  -- 072
  INSERT INTO _conferencia VALUES (1, '072 · Admin grava categorias',
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename='categories'
                        AND policyname='admin_write_categories')
         THEN 'OK' ELSE 'FALTA RODAR' END);

  -- 073
  INSERT INTO _conferencia VALUES (2, '073 · Coluna de modal',
    CASE WHEN temModal THEN 'OK' ELSE 'FALTA RODAR' END);

  IF temModal THEN
    FOR v IN EXECUTE
      'SELECT DISTINCT modal FROM vehicles WHERE is_active ORDER BY modal'
    LOOP
      EXECUTE format(
        'SELECT string_agg(name, '', '' ORDER BY name) FROM vehicles
          WHERE is_active AND modal = %L', v) INTO STRICT total;
      INSERT INTO _conferencia VALUES (3, '   frota ' || upper(v), total);
    END LOOP;

    EXECUTE 'SELECT coalesce(string_agg(n, '', '' ORDER BY n), ''(nenhuma)'') FROM (
               SELECT name AS n FROM transfers WHERE modal = ''aereo''
               UNION ALL SELECT name FROM categories WHERE modal = ''aereo'') x' INTO v;
    INSERT INTO _conferencia VALUES (4, '   categorias aéreas', v);

    EXECUTE 'SELECT count(*) FROM tours t JOIN categories c ON c.id = t.category_id
              WHERE c.slug = ''voos-panoramicos''' INTO n;
    INSERT INTO _conferencia VALUES (5, '   voos categorizados', n || ' (esperado 11)');
  END IF;

  -- 075
  INSERT INTO _conferencia VALUES (6, '075 · Modal cadastrável',
    CASE WHEN (SELECT count(*) FROM pg_constraint WHERE conname LIKE '%\_modal\_fkey') = 3
         THEN 'OK' ELSE 'FALTA RODAR' END);
  IF temTabela THEN
    EXECUTE 'SELECT string_agg(name, '', '' ORDER BY sort_order) FROM service_modals WHERE is_active' INTO v;
    INSERT INTO _conferencia VALUES (7, '   modais cadastrados', v);
  END IF;

  -- 076
  INSERT INTO _conferencia VALUES (8, '076 · Cooperativa escolhe modal',
    CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                       WHERE conname='operator_service_preferences_entity_type_check'
                         AND pg_get_constraintdef(oid) LIKE '%modal%')
         THEN 'OK' ELSE 'FALTA RODAR' END);

  -- 077
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name='users' AND column_name='accepts_combos') THEN
    EXECUTE 'SELECT count(*) FROM users WHERE user_type=''operator'' AND is_active AND accepts_combos' INTO n;
    EXECUTE 'SELECT count(*) FROM users WHERE user_type=''operator'' AND is_active' INTO qtd;
    INSERT INTO _conferencia VALUES (9, '077 · Operador universal',
      'OK — ' || n || ' de ' || qtd || ' cooperativas aceitam combo');
  ELSE
    INSERT INTO _conferencia VALUES (9, '077 · Operador universal', 'FALTA RODAR');
  END IF;
END $$;

SELECT verificacao, resultado FROM _conferencia ORDER BY o, verificacao;
