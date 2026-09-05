-- ─────────────────────────────────────────────────────────────────────────────
-- PIX e cartão cobrando de verdade — o que conferir e o que mudar
--
-- Contexto: a tela do turista apareceu com "Modo de teste ativo" e as instruções
-- de PIX manual ("Chave PIX ainda não configurada"). Isso NÃO é falha de código:
-- é o gateway ativo. Com `payment_gateway = 'test'` o servidor nem chega a falar
-- com o Mercado Pago — devolve um PIX de mentira que aprova sozinho.
--
-- Rode o PASSO 1 primeiro e leia o resultado. Só rode o PASSO 2 depois.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASSO 1: como está agora ────────────────────────────────────────────────
SELECT setting_key,
       setting_value,
       CASE
         WHEN setting_key = 'payment_gateway' AND setting_value <> 'mercado_pago'
           THEN '<<< precisa virar mercado_pago'
         WHEN setting_key = 'payment_gateway_env' AND setting_value <> 'production'
           THEN '<<< precisa virar production'
         ELSE 'ok'
       END AS situacao
  FROM system_settings
 WHERE setting_key IN ('payment_gateway', 'payment_gateway_env')
 ORDER BY setting_key;

-- ── PASSO 2: ligar a cobrança real ──────────────────────────────────────────
-- Descomente e rode.
/*
UPDATE system_settings SET setting_value = 'mercado_pago', updated_at = now()
 WHERE setting_key = 'payment_gateway';

UPDATE system_settings SET setting_value = 'production', updated_at = now()
 WHERE setting_key = 'payment_gateway_env';
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- FALTA UMA COISA QUE NÃO ESTÁ NO BANCO
--
-- O Access Token do Mercado Pago NÃO vem daqui nem do campo "API Key" do admin.
-- O servidor lê a variável de ambiente MERCADO_PAGO_ACCESS_TOKEN, no Render.
--
--   TEST-...      → cobra em sandbox (dinheiro de mentira)
--   APP_USR-...   → cobra de verdade
--
-- E o PIX precisa estar habilitado NA CONTA do Mercado Pago que recebe. Se não
-- estiver, o app mostra o motivo real vindo do Mercado Pago, não uma tela
-- genérica.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Depois de pagar: conferir que a cobrança foi real ───────────────────────
/*
SELECT p.created_at, p.payment_method, p.amount_gross, p.status,
       p.gateway_name, p.gateway_transaction_id
  FROM payments p
 ORDER BY p.created_at DESC
 LIMIT 10;
-- gateway_name = 'mercado_pago' e um gateway_transaction_id numérico = real.
-- gateway_name = 'test' ou 'manual', ou id começando com "TEST-" = não foi.
*/
