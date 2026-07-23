-- =============================================================================
-- 063_mfa.sql — Verificação em duas etapas (2FA/MFA) opcional por WhatsApp
-- =============================================================================
-- Etapa 4 (item 1). Recurso OPCIONAL: cada usuário liga/desliga no perfil.
-- Quando ligado, o login exige um código de 6 dígitos enviado ao WhatsApp
-- (reaproveita a tabela otp_codes / migration 023) além da senha.
--
--   • users.mfa_enabled  — flag por conta (default false: ninguém é forçado).
--   • mfa_challenges     — "sessão pendente" entre a senha validada e o código.
--                          Guarda o refresh_token do Supabase até o 2º fator
--                          ser confirmado; NUNCA vai ao cliente antes disso.
--                          Vida curta (10 min) e consumo único.
-- Idempotente.
-- =============================================================================

-- ── Flag por conta ───────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;

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
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='users' AND column_name='mfa_enabled';   -- 1 linha
--   SELECT count(*) FROM mfa_challenges;                          -- 0
