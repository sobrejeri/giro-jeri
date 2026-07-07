-- =============================================================================
-- GIRO JERI — 041: suporte ao roteamento do feed por veículo operado (Etapa 1)
--
-- Contexto (decisão do Arquiteto/PO): o feed de solicitações da cooperativa
-- passa a casar `booking_vehicles.vehicle_id` × `operator_service_preferences
-- (operator_id, entity_type='vehicle', is_active=true)`. Regra: "todos os
-- veículos do pedido ∈ operados pela coop". Pedido sem linhas em
-- booking_vehicles é fail-open (aparece pra todas as coops). A preferência de
-- VEÍCULO passa a ser admin-only para escrita (coop mantém leitura).
--
-- Esta migration NÃO altera lógica de aplicação — apenas:
--   1) cria os índices que o casamento do feed precisa pra não fazer seq scan;
--   2) fecha uma lacuna de segurança: `operator_service_preferences` nunca
--      teve RLS habilitado (nem policy nenhuma). Hoje isso é inofensivo porque
--      a API só grava essa tabela com a service_role key (bypassa RLS), mas o
--      time já corrigiu esse mesmo tipo de lacuna antes (ver migrations 022 e
--      034) para o dia em que a rota passar a usar `req.supabase` (cliente
--      com o JWT do usuário). A policy nova já modela a regra de negócio:
--      admin grava para qualquer operator_id/entity_type (inclusive 'vehicle'
--      em nome de outra cooperativa); a cooperativa só grava as próprias
--      preferências de 'tour'/'transfer' — 'vehicle' fica admin-only mesmo em
--      escrita direta ao banco. Leitura ('vehicle' incluso) continua liberada
--      para a própria cooperativa.
--
-- Idempotente: pode ser executado quantas vezes for necessário.
-- =============================================================================

-- =============================================================================
-- 1. ÍNDICES
-- =============================================================================

-- booking_vehicles não tinha NENHUM índice além da PK — toda busca por
-- "veículos de uma reserva" (a base do casamento do feed, e também usada hoje
-- em GET /booking/:id e em validate_vehicle_capacity) fazia seq scan.
CREATE INDEX IF NOT EXISTS idx_booking_vehicles_booking ON booking_vehicles(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_vehicles_vehicle ON booking_vehicles(vehicle_id);

-- operator_service_preferences já tinha idx_op_prefs_operator(operator_id) e
-- idx_op_prefs_entity(entity_type, entity_id) (migration 006). A consulta do
-- feed é "preferências ATIVAS de VEÍCULO de UM operador" — um composto cobre
-- os 3 filtros em index-only scan em vez de operator_id + refino em memória.
CREATE INDEX IF NOT EXISTS idx_op_prefs_operator_entity_active
  ON operator_service_preferences(operator_id, entity_type, is_active);

-- =============================================================================
-- 2. RLS em operator_service_preferences (tabela nunca teve RLS habilitado)
-- =============================================================================

ALTER TABLE operator_service_preferences ENABLE ROW LEVEL SECURITY;

-- Leitura: a própria cooperativa vê todas as suas preferências (inclusive as
-- de 'vehicle', que agora são admin-only pra ESCRITA mas continuam com
-- leitura liberada pra coop). Admin vê tudo.
DROP POLICY IF EXISTS "op_prefs_select" ON operator_service_preferences;
CREATE POLICY "op_prefs_select" ON operator_service_preferences
  FOR SELECT USING (
    operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin')
  );

-- Escrita (insert/update/delete): cooperativa só grava 'tour'/'transfer' para
-- si mesma. 'vehicle' é admin-only — inclusive quando o admin grava para uma
-- operator_id diferente da sua (caso de uso da Etapa 1: admin cura a lista de
-- veículos operados por CADA coop).
DROP POLICY IF EXISTS "op_prefs_insert" ON operator_service_preferences;
CREATE POLICY "op_prefs_insert" ON operator_service_preferences
  FOR INSERT WITH CHECK (
    (entity_type IN ('tour', 'transfer')
      AND operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin')
  );

DROP POLICY IF EXISTS "op_prefs_update" ON operator_service_preferences;
CREATE POLICY "op_prefs_update" ON operator_service_preferences
  FOR UPDATE USING (
    (entity_type IN ('tour', 'transfer')
      AND operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin')
  )
  WITH CHECK (
    (entity_type IN ('tour', 'transfer')
      AND operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin')
  );

DROP POLICY IF EXISTS "op_prefs_delete" ON operator_service_preferences;
CREATE POLICY "op_prefs_delete" ON operator_service_preferences
  FOR DELETE USING (
    (entity_type IN ('tour', 'transfer')
      AND operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin')
  );

-- =============================================================================
-- VERIFICAÇÃO
-- Rodar manualmente após aplicar a migration.
-- =============================================================================
-- 1) Índices criados:
--    SELECT indexname, tablename FROM pg_indexes
--     WHERE tablename IN ('booking_vehicles', 'operator_service_preferences')
--     ORDER BY tablename, indexname;
--    Espera: idx_booking_vehicles_booking, idx_booking_vehicles_vehicle,
--            idx_op_prefs_operator (006), idx_op_prefs_entity (006),
--            idx_op_prefs_operator_entity_active (novo).
--
-- 2) RLS habilitado + 4 policies:
--    SELECT relrowsecurity FROM pg_class WHERE relname = 'operator_service_preferences';
--    -- espera: t
--    SELECT policyname, cmd FROM pg_policies
--     WHERE tablename = 'operator_service_preferences' ORDER BY policyname;
--    -- espera: op_prefs_select (SELECT), op_prefs_insert (INSERT),
--    --         op_prefs_update (UPDATE), op_prefs_delete (DELETE)
--
-- 3) Plano de execução usa o índice novo de booking_vehicles (ajuste o uuid):
--    EXPLAIN SELECT vehicle_id FROM booking_vehicles WHERE booking_id = '00000000-0000-0000-0000-000000000000';
--    -- espera: Index Scan using idx_booking_vehicles_booking
--
-- 4) A service_role key (usada por packages/api/src/supabase.js) segue
--    bypassando RLS — nenhum comportamento de escrita da API muda hoje.
--    Isto é só validável lendo o código: supabase.js usa SUPABASE_SERVICE_ROLE_KEY.
-- =============================================================================
