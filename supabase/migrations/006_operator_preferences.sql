-- =============================================================
-- GIRO JERI — 006: Preferências de serviço por operador/cooperativa
-- Cada operador indica com quais tours e veículos trabalha.
-- Modelo opt-in: sem registro = não trabalha com o item.
-- =============================================================

CREATE TABLE IF NOT EXISTS operator_service_preferences (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  operator_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type  VARCHAR(20) NOT NULL CHECK (entity_type IN ('tour', 'vehicle', 'transfer')),
  entity_id    UUID        NOT NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operator_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_op_prefs_operator ON operator_service_preferences(operator_id);
CREATE INDEX IF NOT EXISTS idx_op_prefs_entity   ON operator_service_preferences(entity_type, entity_id);

SELECT create_updated_at_trigger('operator_service_preferences');
