-- =============================================================================
-- GIRO JERI — Migration 033: corrige policies de admin de stories/highlights
--
-- Bug:
--   As policies admin de `stories` (029) e `story_highlights` (030) checavam
--       EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND user_type='admin')
--   mas `users.id` é a PK da aplicação, enquanto `auth.uid()` é o UUID do
--   Supabase Auth (= users.auth_id). Os dois NUNCA são iguais, então a policy
--   jamais concedia acesso de escrita → INSERT/UPDATE/DELETE batiam em
--   "new row violates row-level security policy".
--
--   Todas as outras tabelas do projeto usam o padrão correto
--   `WHERE auth_id = auth.uid()` (ver migrations 001, 002, 022).
--
-- Correção:
--   Recriar as policies usando auth_id = auth.uid() e adicionar WITH CHECK
--   explícito (necessário para INSERT em policies FOR ALL).
-- =============================================================================

-- ── stories ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_stories" ON stories;

CREATE POLICY "admin_stories"
  ON stories
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin')
  );

-- ── story_highlights ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_highlights" ON story_highlights;

CREATE POLICY "admin_highlights"
  ON story_highlights
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin')
  );

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT tablename, policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE tablename IN ('stories', 'story_highlights')
 ORDER BY tablename, policyname;
*/
