-- ─────────────────────────────────────────────────────────────────────────────
-- Que TABELAS estão faltando?
--
-- NÃO É MIGRATION. Só consulta.
--
-- Por que existe: `o_que_falta_rodar.sql` compara COLUNAS. Uma migration que
-- cria uma TABELA inteira passa despercebida por ele — e o sintoma não é erro,
-- é tela vazia: a API engole o 42P01 para não derrubar o pagamento, e o painel
-- diz "nenhum repasse" como se não houvesse nada a receber.
-- ─────────────────────────────────────────────────────────────────────────────

WITH esperado(tabela, migration, para_que) AS (VALUES
  ('booking_payouts',      '080_repasses_por_reserva.sql',   'repasses por reserva (o que a plataforma deve a cada operador)'),
  ('booking_legs',         '042_booking_legs_split_engine.sql', 'motor de pernas (combo com vários operadores)'),
  ('service_modals',       '075_modais_cadastraveis.sql',    'modais terrestre/aéreo/aquático e comissões por modal'),
  ('operator_modals',      '076_operador_por_modal.sql',     'quais modais cada operador atende'),
  ('payment_events',       '001_schema_completo.sql',        'eventos do webhook do Mercado Pago'),
  ('holidays',             '001_schema_completo.sql',        'feriados e acréscimos'),
  ('high_season_rules',    '001_schema_completo.sql',        'alta temporada'),
  ('financial_ledger',     '001_schema_completo.sql',        'razão financeiro'),
  ('operational_assignments','001_schema_completo.sql',      'despacho (motorista e veículo)'),
  ('reviews',              '060_coop_reviews.sql',           'avaliações e reputação do operador')
)
SELECT e.tabela,
       e.migration,
       e.para_que,
       CASE WHEN t.table_name IS NULL THEN '<<< FALTA — rode esta migration' ELSE 'ok' END AS situacao
  FROM esperado e
  LEFT JOIN information_schema.tables t
         ON t.table_schema = 'public' AND t.table_name = e.tabela
 ORDER BY (t.table_name IS NOT NULL), e.tabela;
