-- =============================================================================
-- 011 — Configurações de gateway de pagamento e split
-- =============================================================================

INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES

  -- Gateway ativo
  ('payment_gateway',
   'manual',
   'string',
   'Gateway de pagamento ativo: manual | asaas | pagarme'),

  ('payment_gateway_env',
   'sandbox',
   'string',
   'Ambiente do gateway: sandbox | production'),

  -- Credenciais (valores sensíveis — nunca expor no frontend)
  ('payment_gateway_api_key',
   '',
   'string',
   'API Key do gateway de pagamento (mantida no servidor)'),

  ('payment_gateway_webhook_secret',
   '',
   'string',
   'Webhook secret do gateway para validar callbacks'),

  -- Split de recebimento
  ('payment_split_admin_pct',
   '15',
   'number',
   'Percentual da plataforma (admin) em cada pagamento. O restante vai para a cooperativa.'),

  -- Conta de recebimento da plataforma (admin)
  ('payment_admin_pix_key_type',
   'cnpj',
   'string',
   'Tipo da chave PIX da conta da plataforma: cpf | cnpj | email | phone | random_key'),

  ('payment_admin_pix_key',
   '',
   'string',
   'Chave PIX da conta de recebimento da plataforma'),

  ('payment_admin_bank_name',
   '',
   'string',
   'Nome do banco da conta da plataforma'),

  ('payment_admin_bank_agency',
   '',
   'string',
   'Agência bancária da conta da plataforma'),

  ('payment_admin_bank_account',
   '',
   'string',
   'Número da conta bancária da plataforma'),

  ('payment_admin_bank_account_type',
   'corrente',
   'string',
   'Tipo de conta da plataforma: corrente | poupanca'),

  ('payment_admin_bank_document',
   '',
   'string',
   'CPF ou CNPJ do titular da conta da plataforma')

ON CONFLICT (setting_key) DO NOTHING;
