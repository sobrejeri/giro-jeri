-- =============================================================================
-- 087_split_operador_unico.sql — Split no cartão para reserva de UM operador
-- =============================================================================
-- A 079 desligou o split porque o caso de VÁRIOS recebedores (`disbursements`)
-- só funciona com PIX, e voo parcelado precisa de cartão.
--
-- Mas reserva de UM operador tem só DOIS recebedores — plataforma e operador —
-- e esse caso usa `application_fee`, que FUNCIONA com cartão. É o modelo
-- marketplace de sempre. Ou seja: passeio e translado avulso aceitos por um
-- operador podem voltar a ser divididos no ato.
--
-- O que este migration prepara:
--
-- 1. REGISTRO DE QUE HOUVE SPLIT. Sem isso o repasse manual (080) lançaria a
--    comissão de novo, e o admin pagaria uma segunda vez o que o gateway já
--    depositou. É o risco mais caro dessa mudança, e é o motivo da coluna.
--
-- 2. A CHAVE que liga. Nasce DESLIGADA de propósito: o fluxo básico
--    (plataforma recebe 100%) nunca foi testado com uma cobrança real, e ligar
--    split antes disso é somar duas incógnitas no mesmo teste.
-- =============================================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS split_operator_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS split_application_fee NUMERIC(10, 2);

COMMENT ON COLUMN payments.split_operator_id IS
  'Operador que recebeu DIRETO do gateway, via split de 2 recebedores. Não '
  'nulo = a comissão dele já foi paga na cobrança, e `gerarRepasses` NÃO deve '
  'lançar repasse de comissão para esta reserva — seria pagamento em dobro.';
COMMENT ON COLUMN payments.split_application_fee IS
  'Quanto ficou com a plataforma na cobrança (application_fee). Guardado para '
  'conferência: é o que o extrato do Mercado Pago tem que mostrar.';

-- A conferência de repasses cruza pagamento com reserva por aqui.
CREATE INDEX IF NOT EXISTS idx_payments_split_operator
  ON payments (split_operator_id)
  WHERE split_operator_id IS NOT NULL;

-- ── A chave ─────────────────────────────────────────────────────────────────
INSERT INTO system_settings (setting_key, setting_value, value_type, description)
VALUES (
  'payment_split_single_operator', 'false', 'boolean',
  'true = reserva com UM operador é dividida no ato da cobrança '
  '(application_fee, funciona com cartão): o operador recebe a parte dele '
  'direto do Mercado Pago e a plataforma fica com a comissão. Só vale quando o '
  'operador tem conta conectada e o modal NÃO tem executor fixo — nesses casos '
  'cai no modelo manual da 079. Combo continua sempre manual.'
)
ON CONFLICT (setting_key) DO UPDATE SET description = EXCLUDED.description;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- A chave está ligada?
SELECT setting_key, setting_value FROM system_settings
 WHERE setting_key IN ('payment_platform_receives_all', 'payment_split_single_operator');

-- Quem pode receber por split (precisa de conta conectada):
SELECT u.full_name,
       (u.mp_access_token IS NOT NULL) AS conta_conectada,
       u.platform_split_pct            AS pct_proprio
  FROM users u
 WHERE u.user_type = 'operator' AND coalesce(u.is_active, true)
 ORDER BY 2 DESC, 1;

-- Modais com executor fixo NUNCA usam split (o dinheiro tem que chegar a quem
-- executa, e um split de 2 recebedores só alcança quem aceitou):
SELECT m.name, coalesce(u.full_name, '(quem aceita executa)') AS executor,
       CASE WHEN m.executor_operator_id IS NULL THEN 'pode usar split'
            ELSE 'sempre manual' END AS regra
  FROM service_modals m LEFT JOIN users u ON u.id = m.executor_operator_id
 ORDER BY m.sort_order;

-- Cobranças que já foram divididas no ato (não devem gerar repasse):
SELECT p.created_at::date AS dia, u.full_name AS operador,
       p.amount AS cobrado, p.split_application_fee AS ficou_com_a_plataforma
  FROM payments p JOIN users u ON u.id = p.split_operator_id
 ORDER BY p.created_at DESC LIMIT 20;
*/
