-- =============================================================================
-- 058_emergency_email.sql — E-mail no contato de emergência
-- =============================================================================
-- O contato de emergência do turista ganha e-mail além de nome/telefone.
-- Aditiva e idempotente.
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_email VARCHAR(200);

COMMENT ON COLUMN users.emergency_contact_email IS
  'E-mail do contato de emergência do turista (opcional).';

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='users' AND column_name='emergency_contact_email';
