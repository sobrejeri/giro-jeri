-- =============================================================================
-- 022 — Credenciais oficiais NuPay 2FA
-- =============================================================================

INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES
  ('payment_nupay_app_key',
   '',
   'string',
   'App Key NuPay for Business enviado no header X-Merchant-Key.'),

  ('payment_nupay_app_token',
   '',
   'string',
   'App Token NuPay for Business enviado no header X-Merchant-Token.')
ON CONFLICT (setting_key) DO NOTHING;

UPDATE system_settings
SET description = 'LEGADO: use payment_nupay_app_key para NuPay 2FA.'
WHERE setting_key = 'payment_nupay_client_id';

UPDATE system_settings
SET description = 'LEGADO: use payment_nupay_app_token para NuPay 2FA.'
WHERE setting_key = 'payment_nupay_client_secret';
