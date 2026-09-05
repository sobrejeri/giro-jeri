-- =============================================================================
-- 088. Tentativa de pagamento e webhook idempotente
-- =============================================================================
-- Duas cobranças pelo mesmo pedido nasciam de dois buracos:
--
--   1. Não existia identidade de TENTATIVA. Cada envio do checkout gerava uma
--      chave de idempotência nova, então o Mercado Pago tratava o retry de um
--      timeout como uma compra nova — e cobrava de novo.
--
--   2. O webhook não tinha como saber se já tinha processado aquele evento. A
--      reentrega do MP (que é normal, não excepcional) reexecutava os efeitos.
--
-- Esta migration cria as duas identidades. A trava é do BANCO, não do
-- JavaScript: dois processos simultâneos leem "não existe" antes de qualquer um
-- escrever, e só o índice UNIQUE decide quem ficou com a tentativa.
--
-- NÃO altera split, percentual, system_settings nem users.platform_split_pct.
-- Nenhuma coluna é removida e nenhum dado existente é reescrito.
-- =============================================================================

-- ── Tentativa ────────────────────────────────────────────────────────────────
-- payment_attempt_id é a chave que o navegador gera UMA vez por tentativa de
-- pagar e mantém através de erro ambíguo (rede, timeout). Ela vira o
-- X-Idempotency-Key do Mercado Pago, então repetir a mesma tentativa devolve a
-- MESMA cobrança em vez de criar uma segunda.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_attempt_id UUID,
  ADD COLUMN IF NOT EXISTS status_detail      VARCHAR(120),
  ADD COLUMN IF NOT EXISTS collector_id       VARCHAR(50);

-- UNIQUE PARCIAL: só vale para linhas que têm tentativa. PIX, pagamento manual
-- e todo o histórico ficam com NULL e não colidem entre si.
CREATE UNIQUE INDEX IF NOT EXISTS payments_payment_attempt_id_key
  ON payments(payment_attempt_id) WHERE payment_attempt_id IS NOT NULL;

COMMENT ON COLUMN payments.payment_attempt_id IS
  'Chave da tentativa de pagamento, gerada pelo checkout e usada como X-Idempotency-Key no gateway. Sobrevive a erro ambíguo; só muda depois de um estado DEFINITIVO (aprovado ou recusado).';
COMMENT ON COLUMN payments.status_detail IS
  'Motivo detalhado devolvido pelo gateway (ex.: cc_rejected_high_risk).';
COMMENT ON COLUMN payments.collector_id IS
  'Conta que recebeu no gateway. Com split é a do operador; sem split, a da plataforma.';

-- ── Webhook ──────────────────────────────────────────────────────────────────
-- A UNIQUE original de payment_events era (payment_id, event_name, received_at).
-- Com received_at no meio, ela nunca colide: cada reentrega chega num instante
-- diferente e entra como um evento novo. Ou seja, não protegia nada.
ALTER TABLE payment_events
  ADD COLUMN IF NOT EXISTS gateway_event_id VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_gateway_event_id_key
  ON payment_events(gateway_event_id) WHERE gateway_event_id IS NOT NULL;

-- O aviso do Mercado Pago pode chegar ANTES do nosso INSERT — a janela existe,
-- porque ele dispara no mesmo instante em que cria a cobrança. Com payment_id
-- NOT NULL, gravar esse evento era impossível, então ele era descartado e
-- respondíamos 200: para o MP, entregue e resolvido; para nós, perdido.
-- Aceitando NULL, o evento fica guardado e é reconciliado quando o pagamento
-- local aparece.
ALTER TABLE payment_events
  ALTER COLUMN payment_id DROP NOT NULL;

COMMENT ON COLUMN payment_events.gateway_event_id IS
  'Identificador do evento no gateway. É por ele que a reentrega é reconhecida como repetição, e não pela combinação com received_at (que nunca repete).';
COMMENT ON COLUMN payment_events.payment_id IS
  'Nulo enquanto o evento chega antes do pagamento local existir; preenchido na reconciliação.';
