-- =============================================================================
-- 090 — Modelo de repasse MANUAL: desliga o split no ato (os dois gateways)
-- =============================================================================
-- Decisão de negócio: o operador deve ser pago DEPOIS da conclusão do serviço,
-- pela tela de Repasses — e não no ato da cobrança. Com o split ligado, a fatia
-- do operador cai no recebedor dele na hora do pagamento (antes da conclusão),
-- o que impede segurar o valor até o serviço acontecer.
--
-- `payment_split_single_operator = 'false'` faz a cobrança nascer 100% na conta
-- da plataforma; o repasse ao operador vira uma linha em `booking_payouts`
-- (pending) que o admin libera pela tela de Repasses. Vale para Mercado Pago
-- (contextoSplitOperadorUnico) E Pagar.me (splitDoPagarme) — os dois passam a
-- respeitar o mesmo flag.
--
-- Reversível: o admin pode religar o split no ato em Configurações → Pagamentos.

UPDATE system_settings
   SET setting_value = 'false',
       updated_at    = NOW()
 WHERE setting_key = 'payment_split_single_operator';

-- Garante a chave existir mesmo em instalações anteriores à migration 087.
INSERT INTO system_settings (setting_key, setting_value, value_type, description)
VALUES ('payment_split_single_operator', 'false', 'boolean',
        'Divide a cobrança no ato entre plataforma e operador (split). Desligado = plataforma recebe 100% e repassa pela tela de Repasses após a conclusão.')
ON CONFLICT (setting_key) DO NOTHING;
