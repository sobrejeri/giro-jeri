-- =============================================================================
-- GIRO JERI — 036: conexão Mercado Pago (split de pagamentos / marketplace)
--
-- Fase 2b do pagamento: split automático. Cada cooperativa conecta a própria
-- conta Mercado Pago via OAuth; o dinheiro do passeio cai direto na conta dela
-- e a comissão da plataforma (users.platform_split_pct, ou o padrão global
-- payment_split_admin_pct) é descontada automaticamente via application_fee.
--
-- Estas colunas guardam as credenciais OAuth do vendedor (cooperativa):
--   mp_user_id          — id da conta MP da cooperativa (collector id)
--   mp_access_token     — token para criar pagamentos NA conta da cooperativa
--   mp_refresh_token    — renova o access_token (expira em ~180 dias)
--   mp_public_key       — chave pública do vendedor (tokeniza o cartão no Brick)
--   mp_token_expires_at — validade do access_token
--   mp_connected_at     — quando a cooperativa conectou
--
-- Segurança: os tokens são sensíveis e só são lidos pela API (service role).
-- Nenhuma rota expõe access_token/refresh_token ao cliente; apenas a public_key
-- (que é pública por natureza) é usada no checkout.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mp_user_id          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS mp_access_token     TEXT,
  ADD COLUMN IF NOT EXISTS mp_refresh_token    TEXT,
  ADD COLUMN IF NOT EXISTS mp_public_key       VARCHAR(120),
  ADD COLUMN IF NOT EXISTS mp_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mp_connected_at     TIMESTAMPTZ;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'users' AND column_name LIKE 'mp_%'
 ORDER BY column_name;
*/
