-- =============================================================================
-- 045_requeue_legs_on_operator_delete.sql
-- =============================================================================
-- Resolve o conflito FK×CHECK de booking_legs:
--   FK   : operator_id REFERENCES users(id) ON DELETE SET NULL   (042:98)
--   CHECK: status_leg != 'accepted' OR operator_id IS NOT NULL   (042:104)
-- Apagar um usuário-coop que tenha uma perna 'accepted' dispara o SET NULL →
-- operator_id vira NULL numa perna 'accepted' → VIOLA o CHECK → o DELETE do
-- usuário falha no banco. Ou seja: hoje é impossível remover uma coop que
-- tenha qualquer perna aceita.
--
-- Correção: um trigger BEFORE DELETE em users devolve as pernas aceitas da
-- coop ao pool ANTES do delete — volta a 'awaiting_acceptance', zera o
-- operator_id e renova a janela de aceite, para que outra coop possa assumir.
-- Assim o SET NULL da FK não encontra mais pernas 'accepted' e o CHECK não é
-- violado. Realocação fina fica a cargo do admin.
--
-- SECURITY DEFINER: roda com o dono da função (bypassa RLS), garantindo o
-- UPDATE mesmo se o delete vier de um contexto com RLS.
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.
-- =============================================================================

CREATE OR REPLACE FUNCTION requeue_accepted_legs_before_operator_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só faz sentido para operadores; a cláusula WHERE já limita por operator_id,
  -- então para qualquer outro usuário o UPDATE simplesmente não afeta linhas.
  UPDATE booking_legs
  SET status_leg            = 'awaiting_acceptance',
      operator_id           = NULL,
      acceptance_expires_at = GREATEST(acceptance_expires_at, NOW() + INTERVAL '2 hours'),
      updated_at            = NOW()
  WHERE operator_id = OLD.id
    AND status_leg  = 'accepted';

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_requeue_legs_before_operator_delete ON users;
CREATE TRIGGER trg_requeue_legs_before_operator_delete
  BEFORE DELETE ON users
  FOR EACH ROW
  EXECUTE FUNCTION requeue_accepted_legs_before_operator_delete();

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   -- Deve devolver a perna ao pool em vez de falhar:
--   -- 1) crie uma perna accepted apontando p/ um operator de teste
--   -- 2) DELETE FROM users WHERE id = '<operator_de_teste>';
--   -- 3) SELECT status_leg, operator_id FROM booking_legs WHERE id = '<perna>';
--   --    Esperado: 'awaiting_acceptance', NULL (e o DELETE do usuário concluiu)
