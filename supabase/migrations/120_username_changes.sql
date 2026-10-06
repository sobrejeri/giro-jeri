-- =============================================================================
-- 120_username_changes.sql — Histórico de trocas do @ (limite 2 a cada 15 dias)
-- =============================================================================
-- Guarda os instantes das alterações MANUAIS do nome de usuário para aplicar o
-- limite de 2 trocas a cada 15 dias. A geração automática do @ (quando o
-- operador não tem) NÃO entra nessa contagem. Idempotente.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username_changes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT column_name, data_type, column_default FROM information_schema.columns
 WHERE table_name = 'users' AND column_name = 'username_changes';
*/
