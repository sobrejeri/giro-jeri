-- =============================================================================
-- 041 — Configurações do gateway Pagar.me (recebedor da plataforma + chave pública)
-- =============================================================================
-- Complementa a 011. O Pagar.me trabalha com split usando IDs de recebedor
-- (re_xxx): a cobrança nasce na conta da plataforma e é dividida entre o
-- recebedor da própria plataforma (principal — responde pelo chargeback, paga a
-- taxa e absorve o arredondamento) e o recebedor da cooperativa.
--
-- A chave pública (pk_xxx) é exposta ao app do turista para tokenizar o cartão
-- no navegador (o número do cartão nunca passa pelo nosso servidor).

INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES

  ('payment_gateway_recipient_id',
   '',
   'string',
   'Pagar.me: ID do recebedor da própria plataforma (re_xxx) que entra no split como recebedor principal. Dashboard → Recebedores.'),

  ('payment_gateway_public_key',
   '',
   'string',
   'Pagar.me: chave pública (pk_xxx) usada pelo app para tokenizar o cartão no navegador. Dashboard → Configurações → Chaves.')

ON CONFLICT (setting_key) DO NOTHING;
