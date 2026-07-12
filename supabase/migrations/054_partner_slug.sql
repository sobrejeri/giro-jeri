-- =============================================================================
-- 054_partner_slug.sql — Link direto por cooperativa
-- =============================================================================
-- Cada cooperativa ganha um slug público (ex.: /c/coop-do-joao). Reservas
-- criadas por esse link nascem ATRIBUÍDAS à cooperativa (operator_id) em
-- 'awaiting_payment' — sem entrar na fila de disputa e sem aceite (quem
-- compartilhou o link já aceitou). Aditivo e idempotente.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS partner_slug VARCHAR(80);

-- Único quando presente (NULLs não colidem).
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_partner_slug
  ON users (partner_slug) WHERE partner_slug IS NOT NULL;

COMMENT ON COLUMN users.partner_slug IS
  'Slug público do link de vendas direto da cooperativa (/c/<slug>). NULL = sem link.';

-- Backfill: gera slug para operadores ativos que ainda não têm.
-- (nome slugificado + 4 chars do id p/ evitar colisão)
UPDATE users
SET partner_slug = regexp_replace(
      lower(unaccent(coalesce(full_name, 'coop'))),
      '[^a-z0-9]+', '-', 'g'
    ) || '-' || substr(id::text, 1, 4)
WHERE user_type = 'operator'
  AND is_active = TRUE
  AND partner_slug IS NULL
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'unaccent');

-- Fallback sem a extensão unaccent:
UPDATE users
SET partner_slug = regexp_replace(
      lower(coalesce(full_name, 'coop')),
      '[^a-z0-9]+', '-', 'g'
    ) || '-' || substr(id::text, 1, 4)
WHERE user_type = 'operator'
  AND is_active = TRUE
  AND partner_slug IS NULL;

-- ── Verificação ──────────────────────────────────────────────────────────────
--   SELECT full_name, partner_slug FROM users WHERE user_type = 'operator';
