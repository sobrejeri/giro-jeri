-- =============================================================================
-- 072_categories_admin_write_rls.sql — escrita de categorias pelo admin (RLS)
-- =============================================================================
-- Sintoma: criar categoria de passeio falhava com
--   "new row violates row-level security policy for table categories"
--
-- Causa: `categories` tem RLS ligado desde a 001, mas SÓ com a policy de
-- SELECT público (`is_active = TRUE`). A migration **034** criou as policies de
-- escrita do admin para vehicles, tours, transfers e transfer_routes — e
-- esqueceu `categories`, que na época ninguém gravava (a lista vinha do seed).
-- Agora que o painel cria categoria, a falta apareceu.
--
-- A API grava com o JWT do admin (`req.supabase`), então `auth.uid()` resolve e
-- a policy concede o acesso. Mesmo padrão, palavra por palavra, da 034.
--
-- A policy pública de SELECT continua valendo: policies permissivas se somam
-- com OR — o público segue lendo categoria ativa e o admin passa a ler e
-- escrever todas (inclusive as inativas, que ele precisa ver para reativar).
-- =============================================================================

DROP POLICY IF EXISTS "admin_write_categories" ON categories;
CREATE POLICY "admin_write_categories" ON categories FOR ALL
  USING      (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'));

-- =============================================================================
-- VERIFICAÇÃO (espera 1 linha: categories | admin_write_categories | ALL)
-- =============================================================================
/*
SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE tablename = 'categories'
 ORDER BY policyname;
*/
