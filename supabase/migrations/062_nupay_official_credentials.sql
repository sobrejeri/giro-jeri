-- =============================================================================
-- 062 — Limpeza de credenciais NuPay legadas
-- =============================================================================

-- Credenciais são configuradas apenas no secret manager/ambiente do Render.
DELETE FROM system_settings
WHERE setting_key IN (
  'payment_nupay_env',
  'payment_nupay_app_key',
  'payment_nupay_app_token',
  'payment_nupay_client_id',
  'payment_nupay_client_secret',
  'payment_nupay_merchant_id',
  'payment_nupay_webhook_secret'
);

UPDATE system_settings
SET setting_value = 'false'
WHERE setting_key = 'payment_nupay_enabled';
