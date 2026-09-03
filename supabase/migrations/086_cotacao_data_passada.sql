-- =============================================================================
-- 086_cotacao_data_passada.sql — Remove o CHECK que expira a própria linha
-- =============================================================================
-- `transfer_quotes` nasceu com:
--
--     CONSTRAINT quote_date_check CHECK (service_date >= CURRENT_DATE)
--
-- CURRENT_DATE não é imutável. O Postgres só valida o CHECK quando a linha é
-- INSERIDA ou ATUALIZADA — então a cotação entra válida e, no dia seguinte à
-- data do serviço, vira uma linha que existe mas NÃO PODE MAIS SER ALTERADA.
-- Qualquer UPDATE nela falha com 23514.
--
-- O estrago não é teórico. Já apareceu de três formas:
--
--   • apagar uma reserva quebrava no meio: `transfer_quotes.booking_id` é
--     ON DELETE SET NULL, e esse SET NULL é um UPDATE, que revalida a linha;
--   • o gatilho de `updated_at` dispara em todo UPDATE, então nem uma correção
--     de texto passa;
--   • uma cotação antiga não pode ser cancelada nem ter o status corrigido —
--     só apagada.
--
-- E a regra nem devia estar aqui: o comentário original da 002 diz
-- "validação feita na API, não no banco — depende de system_settings". A
-- antecedência mínima é conferida em `validateTransferAdvance` no priceEngine,
-- que é onde ela pode considerar o fuso de Fortaleza e as configurações.
--
-- O CHECK é removido. Nada passa a ser aceito que a API já não conferisse.
-- =============================================================================

ALTER TABLE transfer_quotes DROP CONSTRAINT IF EXISTS quote_date_check;

COMMENT ON COLUMN transfer_quotes.service_date IS
  'Data do serviço pedido. A antecedência mínima é validada na API '
  '(priceEngine → validateTransferAdvance), não no banco: um CHECK com '
  'CURRENT_DATE invalidaria a linha sozinho com o passar do tempo (ver '
  'migration 086).';

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Deve devolver ZERO linhas (a constraint não existe mais):
SELECT conname FROM pg_constraint
 WHERE conrelid = 'transfer_quotes'::regclass AND conname = 'quote_date_check';

-- Quantas cotações estavam presas (data no passado):
SELECT count(*) AS cotacoes_com_data_passada
  FROM transfer_quotes WHERE service_date < CURRENT_DATE;
*/
