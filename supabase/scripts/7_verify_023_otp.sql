-- =============================================================================
-- Verificação da migration 023_otp_verification
--
-- Como usar:
--   psql $DATABASE_URL -f supabase/scripts/7_verify_023_otp.sql
--
-- Cada bloco mostra o que é verificado e o resultado esperado.
-- Se algum retornar 0 linhas onde se espera >0 (ou vice-versa), a migration
-- não foi aplicada corretamente — reaplique ou investigue manualmente.
-- =============================================================================

\echo ''
\echo '=== [1] Colunas novas em users ==='
\echo 'Esperado: 3 linhas (email_verified_at, phone_e164, phone_verified_at)'

SELECT
  column_name,
  data_type,
  is_nullable,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'users'
  AND column_name  IN ('email_verified_at', 'phone_verified_at', 'phone_e164')
ORDER BY column_name;

-- =============================================================================

\echo ''
\echo '=== [2] Booleanos originais ainda existem (phone_verified, email_verified) ==='
\echo 'Esperado: 2 linhas'

SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'users'
  AND column_name  IN ('email_verified', 'phone_verified')
ORDER BY column_name;

-- =============================================================================

\echo ''
\echo '=== [3] Constraint users_phone_key REMOVIDA ==='
\echo 'Esperado: constraint_count = 0'

SELECT COUNT(*) AS constraint_count
FROM pg_constraint
WHERE conname  = 'users_phone_key'
  AND conrelid = 'users'::regclass;

-- =============================================================================

\echo ''
\echo '=== [4] Constraint users_contact_check PRESERVADA ==='
\echo 'Esperado: constraint_count = 1'

SELECT COUNT(*) AS constraint_count
FROM pg_constraint
WHERE conname  = 'users_contact_check'
  AND conrelid = 'users'::regclass;

-- =============================================================================

\echo ''
\echo '=== [5] Índice único parcial idx_users_phone_e164 ==='
\echo 'Esperado: 1 linha com WHERE phone_e164 IS NOT NULL'

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'users'
  AND indexname  = 'idx_users_phone_e164';

-- =============================================================================

\echo ''
\echo '=== [6] Enum otp_channel ==='
\echo 'Esperado: email, whatsapp'

SELECT
  typname,
  enumlabel
FROM pg_type
JOIN pg_enum ON pg_type.oid = pg_enum.enumtypid
WHERE typname = 'otp_channel'
ORDER BY enumsortorder;

-- =============================================================================

\echo ''
\echo '=== [7] Tabela otp_codes existe e tem todas as colunas ==='
\echo 'Esperado: 14 linhas'

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'otp_codes'
ORDER BY ordinal_position;

-- =============================================================================

\echo ''
\echo '=== [8] Índices em otp_codes ==='
\echo 'Esperado: 4 linhas (pkey + idx_otp_one_active + idx_otp_lookup + idx_otp_expires)'

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'otp_codes'
ORDER BY indexname;

-- =============================================================================

\echo ''
\echo '=== [9] idx_otp_one_active é UNIQUE ==='
\echo 'Esperado: indisunique = t'

SELECT
  i.relname   AS index_name,
  ix.indisunique,
  ix.indpred::text AS partial_predicate
FROM pg_index   ix
JOIN pg_class   i  ON i.oid  = ix.indexrelid
JOIN pg_class   t  ON t.oid  = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'otp_codes'
  AND i.relname = 'idx_otp_one_active';

-- =============================================================================

\echo ''
\echo '=== [10] RLS habilitado em otp_codes ==='
\echo 'Esperado: relrowsecurity = t'

SELECT
  relname,
  relrowsecurity
FROM pg_class
WHERE relname      = 'otp_codes'
  AND relnamespace = 'public'::regnamespace;

-- =============================================================================

\echo ''
\echo '=== [11] NENHUMA policy em otp_codes ==='
\echo 'Esperado: policy_count = 0'

SELECT COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'otp_codes';

-- =============================================================================

\echo ''
\echo '=== [12] Função purge_expired_otp_codes existe e é SECURITY DEFINER ==='
\echo 'Esperado: 1 linha com prosecdef = t'

SELECT
  proname,
  prosecdef,
  prorettype::regtype AS return_type
FROM pg_proc
JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
WHERE nspname = 'public'
  AND proname = 'purge_expired_otp_codes';

-- =============================================================================

\echo ''
\echo '=== [13] Backfill: usuários com email devem ter email_verified = TRUE ==='
\echo 'Esperado: pending_email_verification = 0'

SELECT COUNT(*) AS pending_email_verification
FROM users
WHERE email IS NOT NULL
  AND (email_verified IS DISTINCT FROM TRUE OR email_verified_at IS NULL);

-- =============================================================================

\echo ''
\echo '=== [14] Backfill: usuários com phone devem ter phone_verified = TRUE ==='
\echo 'Esperado: pending_phone_verification = 0'

SELECT COUNT(*) AS pending_phone_verification
FROM users
WHERE phone IS NOT NULL
  AND (phone_verified IS DISTINCT FROM TRUE OR phone_verified_at IS NULL);

-- =============================================================================

\echo ''
\echo '=== [15] Backfill: phone_e164 preenchido onde phone começa com + ==='
\echo 'Esperado: unsynced = 0'

SELECT COUNT(*) AS unsynced
FROM users
WHERE phone LIKE '+%'
  AND phone_e164 IS NULL;

-- =============================================================================

\echo ''
\echo '=== [16] Teste de unicidade do índice parcial (smoke test) ==='
\echo 'Verifica se a tabela seria violada por dois phone_e164 iguais não-nulos.'
\echo 'Esperado: duplicates = 0 (qualquer valor > 0 indica dado sujo)'

SELECT
  phone_e164,
  COUNT(*) AS duplicates
FROM users
WHERE phone_e164 IS NOT NULL
GROUP BY phone_e164
HAVING COUNT(*) > 1;

-- =============================================================================

\echo ''
\echo '=== [17] Smoke test: insert + lookup + consume em otp_codes (rollback) ==='
\echo 'Esperado: verificar, consumed_at, cleanup — sem erro'

DO $$
DECLARE
  v_user_id   UUID;
  v_otp_id    UUID;
  v_consumed  TIMESTAMPTZ;
BEGIN
  -- Pega qualquer usuário existente (sem criar dados permanentes)
  SELECT id INTO v_user_id FROM users LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Nenhum usuário encontrado — smoke test de otp_codes pulado.';
    RETURN;
  END IF;

  -- Insert de um OTP de teste
  INSERT INTO otp_codes (user_id, channel, destination, code_hash)
  VALUES (
    v_user_id,
    'email',
    'test@zarpe.io',
    lpad('cafebabe', 64, '0')  -- hash fake, 64 chars
  )
  RETURNING id INTO v_otp_id;

  -- Lookup do código ativo (simula validação)
  PERFORM id FROM otp_codes
  WHERE user_id  = v_user_id
    AND channel  = 'email'
    AND code_hash = lpad('cafebabe', 64, '0')
    AND consumed_at   IS NULL
    AND invalidated_at IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lookup falhou — índice idx_otp_lookup pode estar incorreto.';
  END IF;

  -- Simula consumo
  UPDATE otp_codes
  SET consumed_at = NOW()
  WHERE id = v_otp_id
  RETURNING consumed_at INTO v_consumed;

  IF v_consumed IS NULL THEN
    RAISE EXCEPTION 'consumed_at não foi preenchido.';
  END IF;

  -- Cleanup
  DELETE FROM otp_codes WHERE id = v_otp_id;

  RAISE NOTICE 'Smoke test otp_codes OK — insert, lookup, consume, delete concluídos.';
END;
$$;

-- =============================================================================

\echo ''
\echo '=== FIM DA VERIFICAÇÃO 023 ==='
\echo 'Se todas as seções retornaram os valores esperados, a migration está correta.'
