-- =============================================================================
-- 079_plataforma_recebe_tudo.sql — Plataforma recebe 100%, repasses manuais
-- =============================================================================
-- Decisão do dono, depois de descobrir que o split multi-recebedor do Mercado
-- Pago só funciona com PIX — e voo de R$ 7.600 precisa de cartão parcelado.
--
-- Modelo novo, para TODOS os serviços:
--   • o cliente paga e o valor vai INTEIRO para a conta da plataforma;
--   • o operador que aceitou tem uma COMISSÃO, definida por categoria;
--   • o restante fica com a plataforma, que repassa manualmente a quem executou.
--
-- O que isso resolve, além do cartão:
--   • a cooperativa NÃO precisa mais conectar conta Mercado Pago para aceitar.
--     Hoje `mpGate` bloqueia quem não conectou — operador novo não conseguia
--     trabalhar até resolver a conta. Com a plataforma recebendo, não há para
--     onde mandar split, e a exigência perde sentido.
--   • some a dependência de validar o split de N recebedores com o MP, que
--     nunca foi feita e é o que travava o modelo anterior.
--
-- O custo é operacional e conhecido: dois repasses manuais por reserva.
-- =============================================================================

INSERT INTO system_settings (setting_key, setting_value, value_type, description)
VALUES (
  'payment_platform_receives_all', 'true', 'boolean',
  'true = o pagamento vai inteiro para a conta da plataforma, sem split; a '
  'comissão do operador e o pagamento do executor são repasses manuais. '
  'false = volta ao split por cooperativa (application_fee), que só funciona '
  'com PIX no caso multi-recebedor.'
)
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  description   = EXCLUDED.description;

-- `acceptor_commission_pct` (078) passa a ser a COMISSÃO DO OPERADOR neste
-- modal, valendo para todo serviço — não só para intermediação de aéreo.
COMMENT ON COLUMN service_modals.acceptor_commission_pct IS
  'Comissão %% do operador que ACEITA um serviço deste modal. Vale para todos '
  'os serviços: o pagamento vai inteiro para a plataforma e este percentual é '
  'o que a plataforma repassa a quem aceitou.';

COMMENT ON COLUMN service_modals.executor_operator_id IS
  'Quem EXECUTA todo serviço deste modal, quando não é quem aceita (ex.: o '
  'aéreo é sempre a Frisonfly). Nulo = quem aceita executa. Usado para saber a '
  'quem a plataforma repassa o restante.';

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT setting_key, setting_value FROM system_settings
 WHERE setting_key = 'payment_platform_receives_all';

-- Comissão de cada categoria:
SELECT m.name AS modal, m.acceptor_commission_pct AS comissao_operador,
       coalesce(u.full_name, '(quem aceita executa)') AS executor
  FROM service_modals m LEFT JOIN users u ON u.id = m.executor_operator_id
 ORDER BY m.sort_order;
*/
