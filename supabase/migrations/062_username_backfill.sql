-- =============================================================================
-- 062_username_backfill.sql — Backfill de username (login "só usuário")
-- =============================================================================
-- A migration 061 adicionou users.username (opcional). Para o login SÓ POR
-- USUÁRIO funcionar para TODOS, geramos um username para as contas que ainda
-- não têm, a partir do e-mail (parte antes do @), com sufixo em caso de
-- colisão. Idempotente: só toca em quem está com username NULL.
-- =============================================================================

WITH base AS (
  SELECT id,
         COALESCE(
           NULLIF(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._]', '', 'g'), ''),
           'user'
         ) AS uname
  FROM users
  WHERE username IS NULL
),
ranked AS (
  SELECT id, uname,
         ROW_NUMBER() OVER (PARTITION BY uname ORDER BY id) AS rn
  FROM base
)
UPDATE users u
SET username = CASE WHEN r.rn = 1 THEN r.uname ELSE r.uname || r.rn END
FROM ranked r
WHERE u.id = r.id
  -- não colide com um username já existente (de quem já definiu no perfil)
  AND NOT EXISTS (
    SELECT 1 FROM users x
    WHERE x.id <> u.id
      AND lower(x.username) = lower(CASE WHEN r.rn = 1 THEN r.uname ELSE r.uname || r.rn END)
  );

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   SELECT username, email FROM users WHERE username IS NULL;   -- deve dar 0
--   SELECT username, email FROM users ORDER BY username LIMIT 30;
