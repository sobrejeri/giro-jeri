-- =============================================================================
-- 130_empresa_equipe.sql — a EMPRESA gerencia a própria equipe de operadores
-- =============================================================================
-- "Remover da equipe" NÃO apaga o operador nem desfaz o vínculo: as reservas e
-- as comissões que ele originou continuam no histórico da empresa. A conta é
-- bloqueada (is_active = false) e marcada como removida — some da lista da
-- equipe, mas continua identificável nos relatórios.
-- Depende da 129 (users.company_id). Idempotente.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_removed_at timestamptz;

COMMENT ON COLUMN public.users.company_removed_at IS
  'Quando a empresa removeu este operador da equipe. O vínculo (company_id) é mantido para preservar o histórico.';

NOTIFY pgrst, 'reload schema';
