-- =============================================================================
-- GIRO JERI — Migration 009: dados bancários do operador/cooperativa
-- Adiciona campos de recebimento (PIX e conta bancária) à tabela users
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pix_key_type         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pix_key              VARCHAR(200),
  ADD COLUMN IF NOT EXISTS bank_name            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bank_agency          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_account_number  VARCHAR(30),
  ADD COLUMN IF NOT EXISTS bank_account_type    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_document        VARCHAR(30);

COMMENT ON COLUMN users.pix_key_type         IS 'Tipo da chave PIX: cpf, cnpj, email, phone, random_key';
COMMENT ON COLUMN users.pix_key              IS 'Chave PIX do operador para recebimento';
COMMENT ON COLUMN users.bank_name            IS 'Nome do banco (ex: Nubank, Banco do Brasil)';
COMMENT ON COLUMN users.bank_agency          IS 'Agência bancária';
COMMENT ON COLUMN users.bank_account_number  IS 'Número da conta bancária';
COMMENT ON COLUMN users.bank_account_type    IS 'Tipo de conta: corrente ou poupanca';
COMMENT ON COLUMN users.bank_document        IS 'CPF ou CNPJ do titular da conta bancária';
