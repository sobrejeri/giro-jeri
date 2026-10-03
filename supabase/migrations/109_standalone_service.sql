-- 109 — Serviço "não combinável" (solicitação/cobrança separada do combo)
--
-- Serviços aéreos (voo panorâmico) são de valor alto e têm executor único.
-- Não devem entrar num combo (mesmo order_group_id) com passeios baratos:
--   • combo com operadores diferentes DESLIGA o split no cartão;
--   • isolado, o aéreo vira pagamento de operador único e o split divide
--     plataforma + executor no cartão.
--
-- `is_standalone = true` → o cart-request dá a esse serviço um order_group_id
-- próprio, nunca o grupo compartilhado do carrinho.
--
-- A API é TOLERANTE à ausência da coluna (degrada para o comportamento atual).
-- Aplicar manualmente no Supabase (SQL Editor). Idempotente.
ALTER TABLE service_modals ADD COLUMN IF NOT EXISTS is_standalone boolean NOT NULL DEFAULT false;

-- Já liga para quem tem executor fixo (os aéreos). Ajustável depois pelo admin.
UPDATE service_modals SET is_standalone = true WHERE executor_operator_id IS NOT NULL;
