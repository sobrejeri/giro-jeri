-- ─────────────────────────────────────────────────────────────────────────────
-- O split está pronto para funcionar?
--
-- NÃO É MIGRATION. Só consulta.
--
-- Cinco condições. Basta UMA falhar e o valor cai inteiro na plataforma — sem
-- erro na tela, sem aviso: o código é fail-closed de propósito, porque errar
-- para "ficou com a plataforma" se corrige com um repasse, e errar para o outro
-- lado manda dinheiro para conta de terceiro e não tem volta.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT '1. chave do split ligada' AS condicao,
       coalesce((SELECT setting_value FROM system_settings
                  WHERE setting_key = 'payment_split_single_operator'), '(não existe)') AS valor,
       CASE WHEN (SELECT setting_value FROM system_settings
                   WHERE setting_key = 'payment_split_single_operator') = 'true'
            THEN 'ok' ELSE '<<< desligada — tudo cai na plataforma' END AS situacao

UNION ALL
SELECT '2. gateway em mercado_pago',
       coalesce((SELECT setting_value FROM system_settings WHERE setting_key = 'payment_gateway'), '(não existe)'),
       CASE WHEN (SELECT setting_value FROM system_settings WHERE setting_key = 'payment_gateway') = 'mercado_pago'
            THEN 'ok' ELSE '<<< sem o Mercado Pago não existe split' END

UNION ALL
-- Access token E chave pública. A chave pública é o que o app usa para
-- tokenizar o cartão NA conta do operador; sem ela, o servidor não consegue
-- afirmar que o token pertence àquela conta e recusa o split (por segurança).
SELECT '3. operador com token E chave pública',
       u.full_name,
       CASE WHEN u.mp_access_token IS NULL THEN '<<< sem access token — não recebe por split'
            WHEN u.mp_public_key   IS NULL THEN '<<< sem chave pública — cartão não será dividido'
            ELSE 'ok' END
  FROM users u
 WHERE u.user_type = 'operator' AND coalesce(u.is_active, true)

UNION ALL
-- Modal com executor fixo NUNCA usa split: um split de dois recebedores só
-- alcança quem ACEITOU, e o dinheiro precisa chegar a quem EXECUTA.
SELECT '4. modal sem executor fixo',
       m.name,
       CASE WHEN m.executor_operator_id IS NULL THEN 'ok'
            ELSE '<<< tem executor fixo — sempre manual' END
  FROM service_modals m

UNION ALL
-- A comissão precisa sobrar algo para o operador e não pode passar do cobrado.
SELECT '5. percentual da plataforma viável',
       coalesce(u.platform_split_pct::text,
                (SELECT setting_value FROM system_settings WHERE setting_key = 'payment_split_admin_pct'),
                '(nenhum)') || '%',
       CASE WHEN coalesce(u.platform_split_pct,
                 (SELECT setting_value::numeric FROM system_settings WHERE setting_key = 'payment_split_admin_pct'), 0)
                 BETWEEN 0 AND 99.99
            THEN 'ok' ELSE '<<< 100% ou mais: o MP recusa e cai no manual' END
  FROM users u
 WHERE u.user_type = 'operator' AND coalesce(u.is_active, true);

-- ── A prova final, depois de uma cobrança nova ──────────────────────────────
/*
SELECT p.created_at::date, u.full_name AS operador,
       p.payment_method,
       p.amount_gross                                        AS cobrado,
       p.split_application_fee                               AS ficou_com_a_plataforma,
       p.amount_gross - coalesce(p.split_application_fee,0)  AS foi_para_o_operador
  FROM payments p
  LEFT JOIN users u ON u.id = p.split_operator_id
 WHERE p.split_operator_id IS NOT NULL
 ORDER BY p.created_at DESC LIMIT 10;
*/
