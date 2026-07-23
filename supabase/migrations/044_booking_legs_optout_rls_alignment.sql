-- =============================================================================
-- 044_booking_legs_optout_rls_alignment.sql
-- =============================================================================
-- Alinha a RLS de booking_legs ao modelo OPT-OUT já implementado pela API e
-- pelo admin (e declarado pela 041): "todos os operadores veem/aceitam as
-- pernas pendentes por padrão; o admin (ou a própria coop) DESLIGA veículos
-- específicos gravando operator_service_preferences(entity_type='vehicle',
-- is_active=FALSE)".
--
-- A 042 tinha modelado essas duas policies como OPT-IN (exigia is_active=TRUE),
-- divergindo do resto do sistema. Como a API roda com service_role (bypassa a
-- RLS), a divergência é latente hoje — mas viraria um bug no dia em que a rota
-- usar req.supabase (JWT do usuário). Esta migração remove a armadilha.
--
-- Segurança: no opt-out, a condição "não desligou este veículo" (NOT EXISTS de
-- uma linha is_active=FALSE) casaria também para quem NÃO tem nenhuma linha —
-- inclusive turistas. Por isso adicionamos a trava explícita de papel
-- (user_type='operator'), que no opt-in era implícita (só operador tinha linha
-- is_active=TRUE). Espelha op_prefs_* da 041.
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE.
-- =============================================================================

-- ── Cooperativa — leitura (opt-out) ──────────────────────────────────────────
-- Vê a própria perna (já aceita, por operator_id) OU qualquer perna PENDENTE
-- cujo veículo ela NÃO tenha desligado explicitamente.
DROP POLICY IF EXISTS "booking_legs_operator_select" ON booking_legs;
CREATE POLICY "booking_legs_operator_select" ON booking_legs
  FOR SELECT USING (
    operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    OR (
      status_leg = 'awaiting_acceptance'
      AND EXISTS (
        SELECT 1 FROM users
        WHERE auth_id = auth.uid() AND user_type = 'operator'
      )
      AND NOT EXISTS (
        SELECT 1 FROM operator_service_preferences osp
        WHERE osp.entity_type = 'vehicle'
          AND osp.entity_id   = booking_legs.vehicle_id
          AND osp.is_active   = FALSE
          AND osp.operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
      )
    )
  );

-- ── Cooperativa — aceite (opt-out) ───────────────────────────────────────────
-- Só pode mover uma perna PENDENTE, DENTRO do prazo e cujo veículo ela NÃO
-- tenha desligado, para 'accepted' assumindo o próprio operator_id. Continua
-- valendo o UPDATE condicional atômico da API ("primeiro a aceitar vence").
DROP POLICY IF EXISTS "booking_legs_operator_accept" ON booking_legs;
CREATE POLICY "booking_legs_operator_accept" ON booking_legs
  FOR UPDATE USING (
    status_leg = 'awaiting_acceptance'
    AND acceptance_expires_at > NOW()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_id = auth.uid() AND user_type = 'operator'
    )
    AND NOT EXISTS (
      SELECT 1 FROM operator_service_preferences osp
      WHERE osp.entity_type = 'vehicle'
        AND osp.entity_id   = booking_legs.vehicle_id
        AND osp.is_active   = FALSE
        AND osp.operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  )
  WITH CHECK (
    status_leg = 'accepted'
    AND operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- booking_legs_operator_cancel permanece inalterada: trata só a devolução da
-- própria perna aceita à fila (por operator_id), sem relação com opt-in/out.

-- ── Verificação (rodar manualmente após aplicar) ─────────────────────────────
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'booking_legs' ORDER BY policyname;
--   -- Esperado: booking_legs_admin_all, booking_legs_client_select,
--   --           booking_legs_operator_accept, booking_legs_operator_cancel,
--   --           booking_legs_operator_select
