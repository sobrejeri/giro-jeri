-- =============================================================================
-- GIRO JERI — 034: políticas RLS de escrita (admin) para o catálogo
--
-- Problema:
--   As tabelas do catálogo (vehicles, tours, transfers, transfer_routes) têm
--   RLS habilitado mas SÓ com policy de SELECT público. A escrita do admin
--   dependia 100% da chave service_role (que ignora RLS). Quando a API roda
--   com uma chave que NÃO ignora RLS, todo INSERT/UPDATE/DELETE batia em
--   "new row violates row-level security policy for table ...".
--
-- Correção:
--   Adicionar policies FOR ALL para admins, identificados por
--   auth_id = auth.uid() AND user_type = 'admin' (mesmo padrão das migrations
--   001/033). A API passa a gravar usando o JWT do admin (req.supabase), então
--   auth.uid() resolve e a policy concede o acesso — sem depender da chave.
--
--   As policies públicas de SELECT (migration 001) continuam valendo: policies
--   permissivas são combinadas com OR, então o público segue lendo itens ativos
--   e o admin passa a ler/escrever tudo.
-- =============================================================================

-- ── vehicles ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_write_vehicles" ON vehicles;
CREATE POLICY "admin_write_vehicles" ON vehicles FOR ALL
  USING      (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'));

-- ── tours ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_write_tours" ON tours;
CREATE POLICY "admin_write_tours" ON tours FOR ALL
  USING      (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'));

-- ── transfers ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_write_transfers" ON transfers;
CREATE POLICY "admin_write_transfers" ON transfers FOR ALL
  USING      (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'));

-- ── transfer_routes ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_write_transfer_routes" ON transfer_routes;
CREATE POLICY "admin_write_transfer_routes" ON transfer_routes FOR ALL
  USING      (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'));

-- =============================================================================
-- VERIFICAÇÃO (espera 1 linha admin_write_* por tabela)
-- =============================================================================
/*
SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE tablename IN ('vehicles','tours','transfers','transfer_routes')
   AND policyname LIKE 'admin_write_%'
 ORDER BY tablename;
*/
