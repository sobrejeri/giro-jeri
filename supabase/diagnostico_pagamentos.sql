-- ─────────────────────────────────────────────────────────────────────────────
-- Diagnóstico de pagamentos
--
-- NÃO É MIGRATION. Só consulta — não cria, não altera, não apaga. Pode rodar
-- em produção quantas vezes quiser.
--
-- Serve para medir o estrago de três defeitos encontrados na revisão do fluxo
-- de pagamento (e, depois da correção, para confirmar que pararam).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1) O webhook do Mercado Pago manda o status? ─────────────────────────────
-- Esta é a pergunta que sustenta a correção principal. O código lia
-- `data.status` do corpo do evento; a documentação do MP diz que o corpo traz
-- só o id. As respostas reais estão guardadas em payment_events.
--
-- Se "traz_status" vier 0 em todas as linhas, está confirmado: o webhook nunca
-- teve como saber se o pagamento foi aprovado.
SELECT
  event_name,
  count(*)                                                             AS eventos,
  count(*) FILTER (WHERE event_payload_json -> 'data' ? 'status')      AS traz_status,
  min(received_at)::date                                               AS primeiro,
  max(received_at)::date                                               AS ultimo
FROM payment_events
GROUP BY event_name
ORDER BY eventos DESC;


-- ── 2) Dinheiro entrou e a reserva ficou para trás? ──────────────────────────
-- Consequência do defeito 1: quem pagou o PIX e fechou o app não era
-- confirmado, porque só o polling da tela "processando" aprovava.
--
-- Lista pagamentos que ficaram pendentes/expirados mas cujo evento de webhook
-- chegou — ou seja, o MP tentou avisar e nada aconteceu. Confira cada um no
-- painel do Mercado Pago antes de concluir: aqui não dá para saber se o
-- pagamento foi aprovado lá.
SELECT
  p.id,
  b.booking_code,
  p.status                AS status_pagamento,
  b.status_commercial     AS status_reserva,
  p.amount_gross          AS valor,
  p.gateway_transaction_id,
  p.created_at::date      AS criado_em,
  count(e.id)             AS eventos_recebidos
FROM payments p
LEFT JOIN bookings b       ON b.id = p.booking_id
LEFT JOIN payment_events e ON e.payment_id = p.id
WHERE p.status IN ('pending', 'expired')
  AND p.gateway_name = 'mercado_pago'
GROUP BY p.id, b.booking_code, p.status, b.status_commercial, p.amount_gross,
         p.gateway_transaction_id, p.created_at
HAVING count(e.id) > 0
ORDER BY p.created_at DESC
LIMIT 50;


-- ── 3) Receita lançada em dobro? ─────────────────────────────────────────────
-- Consequência da corrida entre webhook e polling: os dois liam "ainda não
-- lancei" ao mesmo tempo e os dois lançavam.
--
-- Deve vir VAZIO. Cada pagamento tem no máximo um lançamento de cada tipo.
SELECT
  payment_id,
  entry_type,
  count(*)         AS vezes,
  sum(amount)      AS somado,
  min(amount)      AS valor_unitario
FROM financial_ledger
WHERE payment_id IS NOT NULL
  AND entry_type IN ('booking_gross', 'gateway_fee', 'booking_net')
GROUP BY payment_id, entry_type
HAVING count(*) > 1
ORDER BY vezes DESC, payment_id;


-- ── 4) Pagamento aprovado sem lançamento nenhum ──────────────────────────────
-- O oposto do item 3: a marca de "já lancei" foi gravada e a gravação dos
-- lançamentos falhou depois. Deve vir VAZIO.
SELECT
  p.id,
  b.booking_code,
  p.amount_gross    AS valor,
  p.ledger_created  AS marcado_como_lancado,
  p.paid_at::date   AS pago_em
FROM payments p
LEFT JOIN bookings b ON b.id = p.booking_id
WHERE p.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM financial_ledger l
     WHERE l.payment_id = p.id AND l.entry_type = 'booking_gross'
  )
ORDER BY p.paid_at DESC NULLS LAST
LIMIT 50;
