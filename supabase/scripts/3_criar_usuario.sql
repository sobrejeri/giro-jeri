-- ═══════════════════════════════════════════════════════════════
-- GIRO JERI — Criar / Atualizar Usuário
-- 1. Crie o usuário no Supabase Auth (Dashboard → Authentication → Users)
-- 2. Copie o UUID gerado
-- 3. Substitua os valores abaixo e execute
-- ═══════════════════════════════════════════════════════════════

-- ── Variáveis — edite aqui ────────────────────────────────────────
DO $$
DECLARE
  v_auth_id  UUID   := 'COLE-AQUI-O-UUID-DO-AUTH';  -- UUID do Supabase Auth
  v_name     TEXT   := 'Nome Completo';
  v_email    TEXT   := 'email@exemplo.com';
  v_type     TEXT   := 'admin';                       -- 'admin' | 'operator' | 'tourist'
BEGIN
  INSERT INTO users (auth_id, full_name, email, user_type, is_active)
  VALUES (v_auth_id, v_name, v_email, v_type::user_type, TRUE)
  ON CONFLICT (email) DO UPDATE SET
    auth_id   = EXCLUDED.auth_id,
    user_type = EXCLUDED.user_type::user_type,
    is_active = TRUE;

  RAISE NOTICE 'Usuário % (%) criado/atualizado como %', v_name, v_email, v_type;
END $$;

-- ── Verificar usuários existentes ────────────────────────────────
SELECT
  u.email,
  u.full_name,
  u.user_type,
  u.is_active,
  u.created_at::DATE AS criado_em,
  CASE WHEN u.auth_id IS NOT NULL THEN '✓' ELSE '✗' END AS tem_auth
FROM users u
WHERE u.user_type IN ('admin', 'operator')
ORDER BY u.user_type, u.email;
