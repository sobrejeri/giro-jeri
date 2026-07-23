-- =============================================================================
-- 056_affiliate_pix_key.sql
-- =============================================================================
-- Chave PIX do afiliado (programa "DIVULGOU, GANHOU"): o turista cadastra a
-- chave no próprio painel e ela aparece para o admin na tela Afiliados —
-- identificar, conferir e pagar SEM precisar entrar em contato.
--
-- A chave fica em users (o afiliado é um usuário); a leitura pelo app passa
-- sempre pela API (service_role) — com o RLS deny-by-default da migration 053,
-- ela não vaza por leitura direta do banco.
-- Aditiva e idempotente (IF NOT EXISTS).
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliate_pix_key      VARCHAR(140);
ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliate_pix_key_type VARCHAR(20);

COMMENT ON COLUMN users.affiliate_pix_key IS
  'Chave PIX para receber comissões do programa de afiliados (repasse manual pelo admin).';
COMMENT ON COLUMN users.affiliate_pix_key_type IS
  'Tipo da chave PIX: cpf | phone | email | random.';

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='users' AND column_name LIKE 'affiliate_pix%';  -- 2 linhas
