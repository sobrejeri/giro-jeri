-- =============================================================================
-- GIRO JERI — Migration 022: ativa gateway Mercado Pago (PIX)
-- =============================================================================

-- O Access Token vai no env var MP_ACCESS_TOKEN do Render (nunca no banco).
-- Aqui apenas seleciona o gateway ativo e define o ambiente.

UPDATE system_settings
   SET setting_value = 'mercado_pago',
       updated_at    = NOW()
 WHERE setting_key = 'payment_gateway';

UPDATE system_settings
   SET setting_value = 'production',
       updated_at    = NOW()
 WHERE setting_key = 'payment_gateway_env';

-- Garante que a linha exista caso nunca tenha sido inserida
INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public)
VALUES
  ('payment_gateway',     'mercado_pago', 'string',  'Gateway de pagamento ativo', false),
  ('payment_gateway_env', 'production',   'string',  'Ambiente do gateway',         false)
ON CONFLICT (setting_key) DO NOTHING;
