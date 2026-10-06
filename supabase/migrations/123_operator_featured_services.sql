-- =============================================================================
-- 123_operator_featured_services.sql — Serviços "mais buscados" do operador
-- =============================================================================
-- O operador escolhe até 5 serviços da sua lojinha para destacar no perfil
-- público (tag "mais buscados"). O limite de 5 é aplicado na API; aqui só
-- guardamos a marcação por serviço. Reaproveita a tabela de preferências: a
-- marca de destaque convive com o opt-in (is_active). Idempotente.
-- =============================================================================

ALTER TABLE operator_service_preferences
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

-- Consulta frequente: "quais são os destaques deste operador?" (checagem do
-- limite de 5 e montagem do perfil público).
CREATE INDEX IF NOT EXISTS idx_osp_featured
  ON operator_service_preferences (operator_id)
  WHERE is_featured = true;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT column_name, data_type, column_default FROM information_schema.columns
 WHERE table_name = 'operator_service_preferences' AND column_name = 'is_featured';
*/
