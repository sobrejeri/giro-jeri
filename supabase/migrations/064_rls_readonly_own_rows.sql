-- =============================================================================
-- 064_rls_readonly_own_rows.sql — Fecha escrita direta do cliente no banco
-- =============================================================================
-- PROBLEMA (crítico, explorável do navegador)
--
-- A migration 001 criou 5 políticas com `FOR ALL USING (<é meu>)`. Em RLS,
-- `FOR ALL` sem `WITH CHECK` reaproveita o USING como check — e RLS não tem
-- granularidade por COLUNA. Resultado: o usuário logado podia dar UPDATE em
-- QUALQUER coluna da própria linha.
--
-- Como a chave anon do Supabase vai no bundle dos apps (é publicável, por
-- design) e todo usuário logado tem um JWT válido, dava para falar direto com
-- o PostgREST, sem passar pela API:
--
--   PATCH /rest/v1/users?id=eq.<meu id>       {"user_type":"admin"}
--     → vira admin (o middleware da API lê user_type do banco) e ganha acesso
--       a /api/admin/* — criar admins, resetar senha de qualquer conta, listar
--       PII de todo mundo.
--
--   PATCH /rest/v1/bookings?id=eq.<minha>     {"status_commercial":"paid"}
--     → serviço confirmado sem pagar. Também dava para zerar total_amount
--       antes do checkout.
--
-- SOLUÇÃO
--
-- Rebaixar as 5 políticas de `FOR ALL` para `FOR SELECT`. Sem política de
-- UPDATE/INSERT/DELETE, o Postgres NEGA essas operações para o papel
-- `authenticated` — que é o comportamento correto aqui.
--
-- POR QUE ISSO NÃO QUEBRA A APLICAÇÃO
--
-- Toda escrita passa pela API, que usa a service_role key e portanto ignora
-- RLS (a autorização de verdade está nas rotas Express). O único acesso
-- direto ao banco a partir do navegador é uma LEITURA: o login do admin
-- (packages/admin/src/pages/Login.jsx) busca o próprio perfil em `users` —
-- e continua funcionando, porque o SELECT é preservado.
--
-- Idempotente: pode rodar mais de uma vez sem erro.
-- =============================================================================

-- ── users ────────────────────────────────────────────────────────────────────
-- Era o pior caso: permitia escalar o próprio user_type para 'admin'.
DROP POLICY IF EXISTS "users_own_data" ON users;
CREATE POLICY "users_own_data" ON users
  FOR SELECT USING (auth.uid()::text = auth_id::text);

-- ── bookings ─────────────────────────────────────────────────────────────────
-- Permitia marcar a própria reserva como paga / alterar o valor.
DROP POLICY IF EXISTS "users_own_bookings" ON bookings;
CREATE POLICY "users_own_bookings" ON bookings
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- ── notifications ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_notifications" ON notifications;
CREATE POLICY "users_own_notifications" ON notifications
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- ── reviews ──────────────────────────────────────────────────────────────────
-- Permitia forjar avaliação com operator_id/nota arbitrários (reputação).
DROP POLICY IF EXISTS "users_own_reviews" ON reviews;
CREATE POLICY "users_own_reviews" ON reviews
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- ── user_addresses ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_addresses" ON user_addresses;
CREATE POLICY "users_own_addresses" ON user_addresses
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- =============================================================================
-- CONFERÊNCIA — nenhuma linha deve voltar (nenhuma política de escrita para o
-- cliente nestas tabelas):
--
--   SELECT tablename, policyname, cmd
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('users','bookings','notifications','reviews','user_addresses')
--      AND cmd <> 'SELECT';
--
-- E o login do admin deve continuar lendo o próprio perfil normalmente.
-- =============================================================================
