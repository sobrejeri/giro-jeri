-- =============================================================================
-- 063_mfa.sql — Verificação em duas etapas (2FA/MFA) por WhatsApp (OBRIGATÓRIA)
-- =============================================================================
-- ⚠️ DEPRECADA (23/07): o 2FA de LOGIN foi removido — o OTP agora valida apenas
-- o CADASTRO. Nenhuma parte do código usa mais `users.mfa_enabled` nem a tabela
-- `mfa_challenges`. Se já rodou esta migration, os objetos ficam órfãos e podem
-- ser removidos com segurança:
--   DROP TABLE IF EXISTS mfa_challenges;
--   ALTER TABLE users DROP COLUMN IF EXISTS mfa_enabled;
-- Se ainda NÃO rodou, pode simplesmente ignorar esta migration.
-- =============================================================================
-- Etapa 4 (item 1). Como o fluxo da plataforma é quase todo por WhatsApp, o 2º
-- fator é OBRIGATÓRIO: todo login com telefone cadastrado exige, além da senha,
-- um código de 6 dígitos enviado ao WhatsApp (reaproveita otp_codes / mig. 023).
--
--   • users.mfa_enabled  — nasce TRUE (obrigatório p/ todos). NÃO é um opt-in do
--                          usuário: serve só como VÁLVULA DE ESCAPE de operação
--                          — pôr em false destrava uma conta específica (ex.: o
--                          admin sem WhatsApp) sem tirar o 2FA de todo mundo.
--   • mfa_challenges     — "sessão pendente" entre a senha validada e o código.
--                          Guarda o refresh_token do Supabase até o 2º fator ser
--                          confirmado; NUNCA vai ao cliente antes disso. Vida
--                          curta (10 min) e consumo único.
-- Idempotente.
-- =============================================================================

-- ── Flag por conta (obrigatório por padrão) ──────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT true;
-- Garante o default/estado mesmo se a coluna já existia de uma execução parcial.
ALTER TABLE users ALTER COLUMN mfa_enabled SET DEFAULT true;
UPDATE users SET mfa_enabled = true WHERE mfa_enabled IS DISTINCT FROM true;

-- ── Desafios de 2FA (sessão pendente) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_challenges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,          -- sessão pendente; consumida no verify
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS mfa_challenges_user_idx    ON mfa_challenges (user_id);
CREATE INDEX IF NOT EXISTS mfa_challenges_expires_idx ON mfa_challenges (expires_at);

-- RLS: a tabela só é acessada pelo backend (service role), nunca pelo cliente.
ALTER TABLE mfa_challenges ENABLE ROW LEVEL SECURITY;
-- (sem policies para authenticated/anon → cliente não lê nem escreve)

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   SELECT mfa_enabled, count(*) FROM users GROUP BY mfa_enabled;  -- todos true
--   SELECT count(*) FROM mfa_challenges;                            -- 0
