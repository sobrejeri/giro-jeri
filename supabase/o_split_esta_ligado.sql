-- ─────────────────────────────────────────────────────────────────────────────
-- O split está mesmo dividindo no ato da cobrança?
--
-- NÃO É MIGRATION. Só consulta.
--
-- Três coisas precisam ser verdade ao mesmo tempo. Se qualquer uma falhar, o
-- dinheiro cai INTEIRO na conta da plataforma e o repasse é manual.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) A chave está ligada?
SELECT '1. chave do split' AS item,
       setting_value       AS valor,
       CASE WHEN setting_value = 'true' THEN 'ok — divide no ato'
            ELSE '<<< DESLIGADA: a plataforma recebe tudo e repassa depois' END AS situacao
  FROM system_settings
 WHERE setting_key = 'payment_split_single_operator';

-- 2) O operador tem conta do Mercado Pago conectada?
--    Sem isso não há para onde o gateway mandar a parte dele.
SELECT '2. conta conectada' AS item,
       full_name            AS valor,
       CASE WHEN mp_access_token IS NOT NULL THEN 'ok'
            ELSE '<<< sem conta conectada — não pode receber por split' END AS situacao
  FROM users
 WHERE user_type = 'operator' AND coalesce(is_active, true)
 ORDER BY full_name;

-- 3) Alguma cobrança FOI de fato dividida?
--    Esta é a prova final: split_operator_id preenchido = o Mercado Pago
--    depositou a parte do operador na conta dele, naquela cobrança.
SELECT '3. cobranças divididas' AS item,
       coalesce(u.full_name, '(nenhuma)') AS valor,
       CASE WHEN p.id IS NULL THEN '<<< nenhuma cobrança foi dividida até agora'
            ELSE 'dividida em ' || p.created_at::date::text
                 || ' — cobrado ' || p.amount_gross::text
                 || ', ficou com a plataforma ' || coalesce(p.split_application_fee::text, '0')
                 || ', foi para o operador '
                 || (p.amount_gross - coalesce(p.split_application_fee, 0))::text END AS situacao
  FROM payments p
  LEFT JOIN users u ON u.id = p.split_operator_id
 WHERE p.split_operator_id IS NOT NULL
 ORDER BY p.created_at DESC
 LIMIT 10;
