-- =============================================================================
-- 021 — NuPay como método de pagamento
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'nupay'
      AND enumtypid = 'payment_method'::regtype
  ) THEN
    ALTER TYPE payment_method ADD VALUE 'nupay';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'expired'
      AND enumtypid = 'status_commercial'::regtype
  ) THEN
    ALTER TYPE status_commercial ADD VALUE 'expired';
  END IF;
END $$;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS gateway_checkout_url TEXT;

ALTER TABLE payment_events
  ADD COLUMN IF NOT EXISTS gateway_name VARCHAR(50),
  ADD COLUMN IF NOT EXISTS gateway_event_id VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_gateway_event
  ON payment_events (gateway_name, gateway_event_id)
  WHERE gateway_name IS NOT NULL AND gateway_event_id IS NOT NULL;

INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES
  ('payment_nupay_enabled',
   'true',
   'boolean',
   'Exibe NuPay/Nubank como opção de pagamento no checkout do turista.'),

  ('payment_nupay_env',
   'mock',
   'string',
   'Ambiente NuPay: mock | sandbox | production.'),

  ('payment_nupay_client_id',
   '',
   'string',
   'LEGADO: use payment_nupay_app_key para NuPay 2FA.'),

  ('payment_nupay_client_secret',
   '',
   'string',
   'LEGADO: use payment_nupay_app_token para NuPay 2FA.'),

  ('payment_nupay_app_key',
   '',
   'string',
   'App Key NuPay for Business enviado no header X-Merchant-Key.'),

  ('payment_nupay_app_token',
   '',
   'string',
   'App Token NuPay for Business enviado no header X-Merchant-Token.'),

  ('payment_nupay_merchant_id',
   '',
   'string',
   'Merchant ID NuPay/Nubank.'),

  ('payment_nupay_webhook_secret',
   '',
   'string',
   'Secret para validar callbacks NuPay.'),

  ('payment_nupay_fee_percent',
   '0',
   'number',
   'Percentual de taxa NuPay usado no ledger interno.')
ON CONFLICT (setting_key) DO NOTHING;
