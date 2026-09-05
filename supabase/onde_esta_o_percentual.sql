-- ─────────────────────────────────────────────────────────────────────────────
-- De onde sai o percentual da plataforma?
--
-- NÃO É MIGRATION. Só consulta.
--
-- Modelo do dono: plataforma 97%, operador 3% (a comissão dele por aceitar).
-- A plataforma paga quem EXECUTA por fora, na aba "Motoristas" dos repasses.
--
-- O percentual pode estar em três lugares. Vale o mais específico:
--   1. acordo com AQUELE operador  (users.platform_split_pct)
--   2. regra da CATEGORIA          (service_modals.platform_commission_pct)
--   3. padrão da casa              (system_settings.payment_split_admin_pct)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Padrão da casa
SELECT 'padrão da casa' AS nivel, setting_key AS onde, setting_value AS pct
  FROM system_settings
 WHERE setting_key = 'payment_split_admin_pct';

-- 2) Acordo por operador (o que manda, quando existe)
SELECT 'acordo com o operador' AS nivel,
       full_name                AS onde,
       coalesce(platform_split_pct::text, '(usa o padrão)') AS pct
  FROM users
 WHERE user_type = 'operator' AND coalesce(is_active, true)
 ORDER BY full_name;

-- 3) Regra por categoria de serviço
SELECT 'regra da categoria' AS nivel,
       name                  AS onde,
       coalesce(platform_commission_pct::text, '(usa o padrão)') AS pct
  FROM service_modals
 ORDER BY sort_order;

-- ── Conferência: o que cada reserva paga vai render ─────────────────────────
-- Simula a conta com o percentual que VALE para cada operador.
SELECT b.booking_code,
       b.total_amount                                    AS cobrado,
       coalesce(u.platform_split_pct,
                (SELECT setting_value::numeric FROM system_settings
                  WHERE setting_key = 'payment_split_admin_pct'), 0) AS pct_plataforma,
       round(b.total_amount * coalesce(u.platform_split_pct,
                (SELECT setting_value::numeric FROM system_settings
                  WHERE setting_key = 'payment_split_admin_pct'), 0) / 100, 2) AS fica_com_a_plataforma,
       b.total_amount - round(b.total_amount * coalesce(u.platform_split_pct,
                (SELECT setting_value::numeric FROM system_settings
                  WHERE setting_key = 'payment_split_admin_pct'), 0) / 100, 2) AS vai_para_o_operador,
       u.full_name                                       AS operador
  FROM bookings b
  LEFT JOIN users u ON u.id = b.operator_id
 WHERE b.status_commercial = 'paid'
 ORDER BY b.created_at DESC
 LIMIT 20;
