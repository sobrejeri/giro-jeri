-- =============================================================================
-- 024 — Colunas de cartão de crédito/débito em payments
--
-- Contexto: implementação de pagamento com cartão via Mercado Pago (tokenização
-- no browser com MP.js; o backend NUNCA recebe PAN/CVV).
--
-- O que já existe e NÃO precisa de migration:
--   • payment_method enum: já contém 'credit_card' e 'debit_card' (001)
--   • raw_response_json JSONB: já existe em payments (001)
--   • ledger_created BOOLEAN: controle de idempotência do ledger (021)
--   • RLS INSERT/UPDATE em payments: já existe (022)
--
-- O que esta migration adiciona:
--   1. installments INT — número de parcelas (1 para débito e à vista; 2–12
--      para crédito parcelado). Coluna própria justificada abaixo.
--   2. card_last_four VARCHAR(4) — últimos 4 dígitos do cartão (PCI-DSS safe;
--      vem na resposta do MP junto com o status aprovado).
--   3. card_brand VARCHAR(30) — bandeira (visa, mastercard, elo, etc.).
--   4. card_holder_name VARCHAR(200) — nome impresso no cartão (vem do token MP).
--   5. gateway_fee_pct DECIMAL(5,4) — percentual real da taxa cobrado pelo
--      gateway para este pagamento. Armazena o valor efetivo usado no cálculo,
--      tornando o ledger auditável sem depender do hardcode 3.5% no código.
--
-- Justificativa para coluna própria de installments:
--   Parcelamento afeta: exibição no e-mail de confirmação, regras de reembolso,
--   data de crédito esperada (parcelas creditam mês a mês) e relatórios.
--   Extrair de raw_response_json a cada query é frágil (schema do MP pode mudar)
--   e impede índice. Custo: 4 bytes por linha.
--
-- Justificativa para gateway_fee_pct:
--   O código atual hardcoda 3.5% para todos os métodos (pagamentos.js linha 428).
--   Cartão de crédito à vista no MP é 4.98%; parcelado é 4.98% + 1.99% ao mês.
--   Manter 3.5% fixo gera P&L incorreto. A coluna permite que o backend registre
--   a taxa real informada pelo MP na resposta — sem quebrar o fluxo atual, pois
--   o DEFAULT 0.035 preserva o comportamento anterior para PIX.
--
-- Todas as colunas são NULLABLE / com DEFAULT para não quebrar linhas existentes
-- (política aditiva — zero downtime).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. COLUNAS NOVAS EM payments
-- ---------------------------------------------------------------------------

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS installments          SMALLINT       DEFAULT 1
                                                 CHECK (installments BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS installment_fee_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS card_last_four        VARCHAR(4),
  ADD COLUMN IF NOT EXISTS card_brand            VARCHAR(30),
  ADD COLUMN IF NOT EXISTS card_holder_name      VARCHAR(200),
  ADD COLUMN IF NOT EXISTS gateway_fee_pct       DECIMAL(5,4)   DEFAULT 0.0350;

COMMENT ON COLUMN payments.installments IS
  'Número de parcelas do cartão (1 = à vista ou débito; 2-12 = crédito parcelado). '
  'Null em pagamentos PIX/manual (não se aplica). '
  'Afeta data de crédito esperada (parcelas creditam mês a mês).';

COMMENT ON COLUMN payments.card_last_four IS
  'Últimos 4 dígitos do cartão, retornados pelo Mercado Pago na aprovação. '
  'Nunca armazenar PAN completo — tokenização ocorre no browser via MP.js.';

COMMENT ON COLUMN payments.card_brand IS
  'Bandeira do cartão: visa, mastercard, elo, hipercard, amex, etc. '
  'Valor retornado pelo Mercado Pago em payment_method_id.';

COMMENT ON COLUMN payments.card_holder_name IS
  'Nome do titular conforme impresso no cartão (vem do token MP). '
  'Usado para exibição no painel admin e conciliação.';

COMMENT ON COLUMN payments.installment_fee_amount IS
  'Valor total dos juros de parcelamento repassados ao turista neste pagamento. '
  'Calculado como (total_cobrado_com_juros - valor_à_vista). '
  'Vem de fees[].value na resposta do Mercado Pago. '
  'NULL para pagamentos à vista, PIX e débito.';

COMMENT ON COLUMN payments.gateway_fee_pct IS
  'Percentual da taxa do gateway EFETIVAMENTE aplicado a este pagamento. '
  'PIX MP: 0.0099 (0.99%). '
  'Cartão à vista MP: 0.0498 (4.98%). '
  'Cartão 2-6x MP: 0.0498 + custo parcela. '
  'Cartão 7-12x MP: 0.0498 + custo parcela maior. '
  'DEFAULT 0.0350 preserva comportamento anterior para linhas PIX/manual já existentes. '
  'O backend DEVE gravar o valor real retornado pelo MP antes de calcular gateway_fee_amount.';

-- ---------------------------------------------------------------------------
-- 2. ÍNDICE DE PERFORMANCE
--    Consultas de conciliação financeira filtram por método + parcelas.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_payments_method_installments
  ON payments(payment_method, installments)
  WHERE payment_method IN ('credit_card', 'debit_card');

-- ---------------------------------------------------------------------------
-- 3. NENHUMA MUDANÇA DE RLS NECESSÁRIA
--    As policies de SELECT, INSERT e UPDATE em payments já cobrem cartão:
--      • "users_own_payments"        — SELECT (001)
--      • "users_own_payments_insert" — INSERT (022)
--      • "users_own_payments_update" — UPDATE (022)
--    Cartão não muda o "dono" da linha — booking_id ainda aponta para o
--    booking do usuário autenticado. Nenhuma policy nova é necessária.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. SYSTEM_SETTINGS — taxas reais do Mercado Pago por método
--    Permite que o backend leia a taxa correta sem hardcode.
--    ON CONFLICT DO NOTHING — idempotente.
-- ---------------------------------------------------------------------------

INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES
  ('gateway_fee_pct_pix',
   '0.0099',
   'number',
   'Taxa MP para PIX (0.99%). Usar para calcular gateway_fee_amount e preencher gateway_fee_pct em payments.'),

  ('gateway_fee_pct_credit_card_1x',
   '0.0498',
   'number',
   'Taxa MP para cartão de crédito à vista (4.98%).'),

  ('gateway_fee_pct_debit_card',
   '0.0150',
   'number',
   'Taxa MP para cartão de débito (1.50%). Confirmar no contrato MP antes de ir a produção.'),

  ('gateway_fee_pct_credit_card_2_6x',
   '0.0498',
   'number',
   'Taxa MP para crédito parcelado 2-6x (4.98% + spread MP por parcela — verificar tabela MP).'),

  ('gateway_fee_pct_credit_card_7_12x',
   '0.0498',
   'number',
   'Taxa MP para crédito parcelado 7-12x (4.98% + spread MP maior — verificar tabela MP).')

ON CONFLICT (setting_key) DO NOTHING;

-- NOTA: os valores de gateway_fee_pct_credit_card_2_6x e _7_12x são
-- aproximações. O MP cobra spread variável por número de parcelas.
-- O Engenheiro Senior deve consultar a tabela de tarifas do contrato MP e
-- atualizar estes settings ANTES de habilitar parcelamento em produção.
-- Alternativa mais precisa: usar o campo fees[].value retornado pelo MP
-- na resposta de aprovação e gravá-lo diretamente em gateway_fee_pct.

-- ---------------------------------------------------------------------------
-- 5. VERIFICAÇÃO INLINE
--    Rodar após aplicar a migration para confirmar o resultado esperado.
-- ---------------------------------------------------------------------------

-- 5a. Colunas novas em payments
SELECT
  column_name,
  data_type,
  character_maximum_length,
  numeric_precision,
  numeric_scale,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'payments'
  AND column_name  IN (
    'installments', 'installment_fee_amount', 'card_last_four', 'card_brand',
    'card_holder_name', 'gateway_fee_pct'
  )
ORDER BY column_name;
-- Esperado: 5 linhas com os tipos e defaults conforme declaração acima.

-- 5b. Índice criado
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'payments'
  AND indexname  = 'idx_payments_method_installments';
-- Esperado: 1 linha.

-- 5c. Settings inseridos
SELECT setting_key, setting_value
FROM system_settings
WHERE setting_key LIKE 'gateway_fee_pct_%'
ORDER BY setting_key;
-- Esperado: 5 linhas (pix, credit_card_1x, debit_card, credit_card_2_6x, credit_card_7_12x).

-- 5d. Constraint de installments
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'payments'::regclass
  AND conname  LIKE '%installments%';
-- Esperado: 1 linha com CHECK (installments BETWEEN 1 AND 12).
