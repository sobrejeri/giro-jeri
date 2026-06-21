-- =============================================================================
-- 023 — OTP Verification (email + WhatsApp)
--
-- Contexto: adiciona infraestrutura de verificação de contato via OTP.
-- Os booleanos email_verified / phone_verified JÁ EXISTEM em users (migration 001)
-- e continuam sendo a fonte de verdade de status.
-- Esta migration adiciona:
--   • Colunas de timestamp de verificação em users (aditivas, nullable)
--   • phone_e164 — número normalizado E.164 para unicidade real
--   • Drop da constraint UNIQUE implícita de phone (users_phone_key)
--     e substituição por índice único parcial em phone_e164
--   • Enum otp_channel
--   • Tabela otp_codes com índices de segurança e performance
--   • RLS habilitado SEM policies — acesso exclusivo via service_role (bypass)
--   • Função purge_expired_otp_codes() para limpeza agendada
--   • Backfill grandfather: usuários existentes recebem verified_at para não
--     quebrarem gates de verificação no fluxo de checkout
--
-- Idempotente: usa IF NOT EXISTS / IF EXISTS / DO $$ guards em todos os passos.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. COLUNAS NOVAS EM users
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_e164        VARCHAR(20);

COMMENT ON COLUMN users.email_verified_at IS
  'Timestamp da primeira confirmação do e-mail via OTP. '
  'Invariante: email_verified = TRUE ⟺ email_verified_at IS NOT NULL.';

COMMENT ON COLUMN users.phone_verified_at IS
  'Timestamp da primeira confirmação do telefone via OTP (WhatsApp). '
  'Invariante: phone_verified = TRUE ⟺ phone_verified_at IS NOT NULL.';

COMMENT ON COLUMN users.phone_e164 IS
  'Telefone normalizado no formato E.164 (ex: +5588999990000). '
  'Utilizado para garantir unicidade real de número. '
  'A coluna phone original permanece como label livre de exibição.';

-- ---------------------------------------------------------------------------
-- 2. UNICIDADE DE TELEFONE
--    A constraint UNIQUE inline de phone criada em 001 se chama users_phone_key
--    (convenção PostgreSQL para UNIQUE inline sem nome explícito).
--    Removemos ela e criamos índice único parcial em phone_e164.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- Drop da constraint UNIQUE implícita de phone, se ainda existir
  IF EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname      = 'users_phone_key'
      AND  conrelid     = 'users'::regclass
      AND  contype      = 'u'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_phone_key;
  END IF;
END;
$$;

-- Índice único parcial em phone_e164 (NULL não compete — nenhum usuário sem
-- telefone ocupa slot de unicidade)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_e164
  ON users(phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- Índice auxiliar para lookup rápido de phone_e164 em autenticação/OTP
CREATE INDEX IF NOT EXISTS idx_users_phone_e164_lookup
  ON users(phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. ENUM otp_channel
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'otp_channel'
  ) THEN
    CREATE TYPE otp_channel AS ENUM ('email', 'whatsapp');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. TABELA otp_codes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS otp_codes (
  id               UUID          NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel          otp_channel   NOT NULL,
  -- Destino real do envio: e-mail ou número E.164
  destination      TEXT          NOT NULL,
  -- HMAC-SHA256 do código em hex (64 chars). Nunca armazenar o código em claro.
  code_hash        CHAR(64)      NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  attempts         SMALLINT      NOT NULL DEFAULT 0,
  max_attempts     SMALLINT      NOT NULL DEFAULT 5,
  consumed_at      TIMESTAMPTZ,
  invalidated_at   TIMESTAMPTZ,
  resend_count     SMALLINT      NOT NULL DEFAULT 0,
  last_resend_at   TIMESTAMPTZ,
  CONSTRAINT otp_max_attempts_positive CHECK (max_attempts > 0),
  CONSTRAINT otp_attempts_range        CHECK (attempts >= 0 AND attempts <= max_attempts)
);

COMMENT ON TABLE otp_codes IS
  'Códigos OTP de verificação de contato (email e WhatsApp). '
  'Acesso exclusivo via service_role — RLS habilitado sem policies. '
  'code_hash = HMAC-SHA256 hex do código de 6 dígitos. '
  'Um código ativo por (user_id, channel) — garantido por idx_otp_one_active.';

COMMENT ON COLUMN otp_codes.code_hash IS
  'HMAC-SHA256 do código OTP em hexadecimal (64 chars). '
  'Nunca armazenar o código em texto claro.';

COMMENT ON COLUMN otp_codes.consumed_at IS
  'Preenchido quando o código é validado com sucesso. '
  'Um código consumed não pode ser reutilizado.';

COMMENT ON COLUMN otp_codes.invalidated_at IS
  'Preenchido quando um reenvio invalida o código anterior, '
  'ou quando o admin/sistema invalida manualmente.';

-- ---------------------------------------------------------------------------
-- 5. ÍNDICES EM otp_codes
-- ---------------------------------------------------------------------------

-- Garante no máximo 1 código ativo por (user_id, channel)
-- "ativo" = não consumido E não invalidado
CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_one_active
  ON otp_codes(user_id, channel)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

-- Lookup de validação: (user_id, channel, code_hash) em códigos ativos
CREATE INDEX IF NOT EXISTS idx_otp_lookup
  ON otp_codes(user_id, channel, code_hash)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

-- Lookup de expirados para purge agendado
CREATE INDEX IF NOT EXISTS idx_otp_expires
  ON otp_codes(expires_at)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

-- ---------------------------------------------------------------------------
-- 6. RLS — habilitado SEM policies
--    service_role faz bypass automático de RLS no Supabase/Postgres.
--    A API (packages/api) usa a service_role key nas operações de OTP.
--    Nenhuma policy = nenhum acesso via anon_key ou JWT de usuário.
-- ---------------------------------------------------------------------------

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- Intencionalmente sem CREATE POLICY.
-- Razão: otp_codes nunca deve ser acessada diretamente pelo cliente.
-- Toda operação (criar, validar, consumir, purgar) ocorre no backend
-- (packages/api) via service_role, que ignora RLS por design do Supabase.

-- ---------------------------------------------------------------------------
-- 7. FUNÇÃO purge_expired_otp_codes()
--    Remove códigos com mais de 48h além da expiração (janela de auditoria).
--    Deve ser chamada por um cron job (pg_cron ou job externo).
--    SECURITY DEFINER para poder deletar independente do caller.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION purge_expired_otp_codes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM otp_codes
  WHERE expires_at < NOW() - INTERVAL '48 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION purge_expired_otp_codes() IS
  'Remove códigos OTP com mais de 48h após a expiração (janela de auditoria). '
  'Retorna o número de linhas deletadas. '
  'Chamar via pg_cron ou job externo (ex: diariamente às 03:00 BRT).';

-- ---------------------------------------------------------------------------
-- 8. BACKFILL GRANDFATHER
--    Usuários existentes que já possuem contato recebem verified=TRUE e
--    verified_at=COALESCE(last_login_at, created_at) para não quebrarem
--    gates de verificação no checkout. Aplica-se a todos os user_type.
--    Idempotente: usa IS DISTINCT FROM TRUE para não re-aplicar.
-- ---------------------------------------------------------------------------

-- 8a. Verificação de e-mail para usuários que já têm e-mail cadastrado
UPDATE users
SET
  email_verified    = TRUE,
  email_verified_at = COALESCE(last_login_at, created_at)
WHERE
  email IS NOT NULL
  AND email_verified IS DISTINCT FROM TRUE;

-- 8b. Verificação de telefone para usuários que já têm phone cadastrado
UPDATE users
SET
  phone_verified    = TRUE,
  phone_verified_at = COALESCE(last_login_at, created_at)
WHERE
  phone IS NOT NULL
  AND phone_verified IS DISTINCT FROM TRUE;

-- 8c. Preencher phone_e164 a partir de phone para números já em formato E.164
UPDATE users
SET
  phone_e164 = phone
WHERE
  phone LIKE '+%'
  AND phone_e164 IS NULL;

-- ---------------------------------------------------------------------------
-- 9. VERIFICAÇÃO INLINE
--    Confirma que colunas, índices, tabela, enum e RLS foram criados.
--    Resultado esperado: todas as linhas retornam com os valores indicados.
-- ---------------------------------------------------------------------------

-- 9a. Colunas novas em users
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'users'
  AND column_name  IN ('email_verified_at', 'phone_verified_at', 'phone_e164')
ORDER BY column_name;
-- Esperado: 3 linhas — email_verified_at (timestamp with time zone, YES),
--                       phone_e164 (character varying, YES),
--                       phone_verified_at (timestamp with time zone, YES)

-- 9b. Índices em users
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'users'
  AND indexname  IN ('idx_users_phone_e164', 'idx_users_phone_e164_lookup');
-- Esperado: 2 linhas

-- 9c. Enum otp_channel
SELECT
  typname,
  enumlabel
FROM pg_type
JOIN pg_enum ON pg_type.oid = pg_enum.enumtypid
WHERE typname = 'otp_channel'
ORDER BY enumsortorder;
-- Esperado: email, whatsapp

-- 9d. Tabela otp_codes e seus índices
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'otp_codes'
ORDER BY indexname;
-- Esperado: idx_otp_expires, idx_otp_lookup, idx_otp_one_active, otp_codes_pkey

-- 9e. RLS habilitado em otp_codes (sem policies)
SELECT
  relname,
  relrowsecurity
FROM pg_class
WHERE relname = 'otp_codes'
  AND relnamespace = 'public'::regnamespace;
-- Esperado: relrowsecurity = true

SELECT COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'otp_codes';
-- Esperado: policy_count = 0

-- 9f. Função purge existe
SELECT
  proname,
  prosecdef
FROM pg_proc
JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
WHERE nspname  = 'public'
  AND proname  = 'purge_expired_otp_codes';
-- Esperado: prosecdef = true (SECURITY DEFINER)

-- 9g. Constraint users_phone_key foi removida
SELECT COUNT(*) AS constraint_count
FROM pg_constraint
WHERE conname   = 'users_phone_key'
  AND conrelid  = 'users'::regclass;
-- Esperado: constraint_count = 0

-- 9h. Check users_contact_check ainda existe
SELECT COUNT(*) AS constraint_count
FROM pg_constraint
WHERE conname   = 'users_contact_check'
  AND conrelid  = 'users'::regclass;
-- Esperado: constraint_count = 1
