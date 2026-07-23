-- =============================================================================
-- 057_whatsapp_validation.sql — Validação do WhatsApp cadastrado
-- =============================================================================
-- A plataforma depende de mensagens automáticas via WhatsApp (coops, clientes,
-- afiliados). Estas colunas guardam o resultado da checagem "phone-exists" do
-- Z-API (o número TEM WhatsApp?), feita automaticamente ao salvar o telefone
-- e sob demanda pelo botão "Verificar" no perfil.
--   whatsapp_valid: NULL = nunca checado · true = tem WhatsApp · false = não tem
-- Aditiva e idempotente.
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_valid      BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN users.whatsapp_valid IS
  'Resultado do phone-exists (Z-API): o telefone cadastrado tem WhatsApp? NULL = nunca checado.';
COMMENT ON COLUMN users.whatsapp_checked_at IS
  'Quando a última checagem de WhatsApp foi feita.';

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='users' AND column_name LIKE 'whatsapp%';  -- 2 linhas
