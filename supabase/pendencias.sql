-- ═════════════════════════════════════════════════════════════════════════════
-- PENDÊNCIAS DO BANCO — rode este arquivo inteiro, de uma vez
--
-- Reúne as migrations que ainda não foram aplicadas. Tudo aqui é IDEMPOTENTE:
-- rodar duas vezes não duplica nada e não quebra nada. Se alguma já tiver sido
-- rodada, a parte dela simplesmente não faz efeito.
--
-- A ordem importa. Não rode fora de ordem.
--
-- No fim há uma seção de CONFERÊNCIA, para ver o que entrou.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1) 024 — Colunas de cartão em `payments`
--
-- ESTA É A URGENTE. É a que causou "Could not find the 'card_brand' column of
-- 'payments' in the schema cache" no pagamento com cartão. Sem ela, NENHUM
-- pagamento com cartão é gravado — e como o cartão já foi cobrado no Mercado
-- Pago antes desta linha existir, a cobrança fica órfã.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS installments           SMALLINT     DEFAULT 1
                                                  CHECK (installments BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS installment_fee_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS card_last_four         VARCHAR(4),
  ADD COLUMN IF NOT EXISTS card_brand             VARCHAR(30),
  ADD COLUMN IF NOT EXISTS card_holder_name       VARCHAR(200),
  ADD COLUMN IF NOT EXISTS gateway_fee_pct        DECIMAL(5,4) DEFAULT 0.0350;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) 084 — Feriado passa a afetar o preço por padrão
--
-- Antes o feriado nascia com affects_pricing = FALSE: ficava cadastrado,
-- aparecia no calendário e não aplicava acréscimo nenhum, em silêncio.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE holidays ALTER COLUMN affects_pricing SET DEFAULT TRUE;

-- Conserta os que já estavam cadastrados com valor mas sem efeito.
UPDATE holidays
   SET affects_pricing = TRUE,
       updated_at      = NOW()
 WHERE affects_pricing = FALSE
   AND is_active
   AND additional_value IS NOT NULL
   AND additional_value <> 0;

UPDATE holidays
   SET additional_type = 'percentage'
 WHERE additional_type IS NULL
   AND additional_value IS NOT NULL;

COMMENT ON COLUMN holidays.affects_pricing IS
  'Este feriado aplica acréscimo no preço. Passou a ser TRUE por padrão na '
  'migration 084: antes nascia FALSE e o feriado ficava cadastrado sem efeito '
  'nenhum, silenciosamente.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) 085 — Feriados e datas comemorativas de 2026 a 2030, com +15%
--
-- Inclui as datas móveis (Carnaval, Páscoa, Corpus Christi, Dia das Mães e dos
-- Pais), calculadas — não digitadas.
--
-- Não sobrescreve nada: pula qualquer data que já exista. E, quando a data cai
-- dentro de uma alta temporada com acréscimo MAIOR, sobe o feriado para o
-- mesmo percentual, para o feriado nunca sair mais barato que o período.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION turiva_pascoa(ano INT) RETURNS DATE AS $$
DECLARE a INT; b INT; c INT; d INT; e INT; f INT; g INT;
        h INT; i INT; k INT; l INT; m INT; n INT;
BEGIN
  a := ano % 19;  b := ano / 100;  c := ano % 100;
  d := b / 4;     e := b % 4;      f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;     k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  n := h + l - 7 * m + 114;
  RETURN make_date(ano, n / 31, (n % 31) + 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

WITH anos AS (
  SELECT generate_series(2026, 2030) AS ano        -- ← troque aqui para outros anos
),
calc AS (
  SELECT ano,
         turiva_pascoa(ano) AS pascoa,
         make_date(ano, 5, 1)
           + ((7 - extract(dow FROM make_date(ano, 5, 1))::int) % 7) + 7 AS maes,
         make_date(ano, 8, 1)
           + ((7 - extract(dow FROM make_date(ano, 8, 1))::int) % 7) + 7 AS pais
    FROM anos
),
datas(d, nome) AS (
  SELECT make_date(ano,  1,  1), 'Confraternização Universal (Ano Novo)' FROM anos
  UNION ALL SELECT make_date(ano,  3, 25), 'Data Magna do Ceará'                  FROM anos
  UNION ALL SELECT make_date(ano,  4, 21), 'Tiradentes'                           FROM anos
  UNION ALL SELECT make_date(ano,  5,  1), 'Dia do Trabalho'                      FROM anos
  UNION ALL SELECT make_date(ano,  6, 12), 'Dia dos Namorados'                    FROM anos
  UNION ALL SELECT make_date(ano,  6, 24), 'São João'                             FROM anos
  UNION ALL SELECT make_date(ano,  9,  7), 'Independência do Brasil'              FROM anos
  UNION ALL SELECT make_date(ano, 10, 12), 'N. Sra. Aparecida / Dia das Crianças' FROM anos
  UNION ALL SELECT make_date(ano, 11,  2), 'Finados'                              FROM anos
  UNION ALL SELECT make_date(ano, 11, 15), 'Proclamação da República'             FROM anos
  UNION ALL SELECT make_date(ano, 11, 20), 'Consciência Negra'                    FROM anos
  UNION ALL SELECT make_date(ano, 12, 24), 'Véspera de Natal'                     FROM anos
  UNION ALL SELECT make_date(ano, 12, 25), 'Natal'                                FROM anos
  UNION ALL SELECT make_date(ano, 12, 31), 'Réveillon'                            FROM anos
  UNION ALL SELECT pascoa - 48, 'Carnaval (segunda)' FROM calc
  UNION ALL SELECT pascoa - 47, 'Carnaval (terça)'   FROM calc
  UNION ALL SELECT pascoa -  2, 'Sexta-feira Santa'  FROM calc
  UNION ALL SELECT pascoa,      'Páscoa'             FROM calc
  UNION ALL SELECT pascoa + 60, 'Corpus Christi'     FROM calc
  UNION ALL SELECT maes,        'Dia das Mães'       FROM calc
  UNION ALL SELECT pais,        'Dia dos Pais'       FROM calc
)
INSERT INTO holidays (name, holiday_date, region_id, affects_pricing,
                      additional_type, additional_value, affects_availability, is_active)
SELECT dt.nome, dt.d, NULL, TRUE, 'percentage'::additional_type, 15, FALSE, TRUE
  FROM datas dt
 WHERE NOT EXISTS (
   SELECT 1 FROM holidays h
    WHERE h.holiday_date = dt.d AND h.region_id IS NULL AND h.is_active
 );

-- Feriado dentro de alta temporada nunca sai mais barato que o período.
UPDATE holidays h
   SET additional_value = s.pct, updated_at = NOW()
  FROM (
    SELECT to_char(hh.holiday_date, 'MMDD') AS md, max(r.additional_value) AS pct
      FROM holidays hh
      JOIN high_season_rules r
        ON r.is_active AND r.additional_value IS NOT NULL
       AND CASE
             WHEN to_char(r.start_date, 'MMDD') <= to_char(r.end_date, 'MMDD')
               THEN to_char(hh.holiday_date, 'MMDD')
                      BETWEEN to_char(r.start_date, 'MMDD') AND to_char(r.end_date, 'MMDD')
             ELSE to_char(hh.holiday_date, 'MMDD') >= to_char(r.start_date, 'MMDD')
               OR  to_char(hh.holiday_date, 'MMDD') <= to_char(r.end_date, 'MMDD')
           END
     GROUP BY 1
  ) s
 WHERE to_char(h.holiday_date, 'MMDD') = s.md
   AND h.is_active AND h.affects_pricing
   AND h.additional_value < s.pct;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4) 086 — Remove o CHECK de data futura em `transfer_quotes`
--
-- `service_date >= CURRENT_DATE` não é imutável: a linha nasce válida e fica
-- inválida sozinha com o passar dos dias. Qualquer UPDATE nela passa a ser
-- recusado — foi o erro 23514 (quote_date_check) que apareceu na limpeza.
-- A antecedência é validada na API, que é onde ela pode mudar sem migration.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE transfer_quotes DROP CONSTRAINT IF EXISTS quote_date_check;

COMMENT ON COLUMN transfer_quotes.service_date IS
  'Data do serviço pedido. A antecedência mínima é validada na API '
  '(priceEngine → validateAdvance), não no banco: um CHECK com CURRENT_DATE '
  'invalidaria a linha sozinho com o passar do tempo (ver migration 086).';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5) 087 — Registro de split no cartão (reserva de UM operador)
--
-- A coluna existe para IMPEDIR PAGAMENTO EM DOBRO: quando o gateway já
-- depositou a parte do operador na própria cobrança, o repasse manual não pode
-- lançar a comissão de novo.
--
-- A chave nasce DESLIGADA de propósito. Não ligue antes de uma cobrança real
-- ter funcionado ponta a ponta no fluxo simples.
-- ─────────────────────────────────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_payments_split_operator
  ON payments (split_operator_id)
  WHERE split_operator_id IS NOT NULL;

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


-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Recarrega o cache de schema do PostgREST
--
-- SEM ISTO A API CONTINUA DANDO O MESMO ERRO. O PostgREST guarda o desenho das
-- tabelas em memória; coluna criada agora só passa a existir para ele depois
-- deste aviso. Foi literalmente o que a mensagem de erro dizia: "in the schema
-- cache".
-- ─────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';


-- ═════════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — rode e leia. Tudo tem que dizer 'ok'.
-- ═════════════════════════════════════════════════════════════════════════════

SELECT '1. colunas de cartão (024)' AS item,
       CASE WHEN count(*) = 6 THEN 'ok' ELSE 'FALTA: ' || (6 - count(*))::text END AS situacao
  FROM information_schema.columns
 WHERE table_name = 'payments'
   AND column_name IN ('installments','installment_fee_amount','card_last_four',
                       'card_brand','card_holder_name','gateway_fee_pct')
UNION ALL
SELECT '2. feriado afeta preço (084)',
       CASE WHEN count(*) = 0 THEN 'ok'
            ELSE count(*)::text || ' feriado(s) com valor e sem efeito' END
  FROM holidays
 WHERE is_active AND NOT affects_pricing
   AND additional_value IS NOT NULL AND additional_value <> 0
UNION ALL
SELECT '3. feriados cadastrados (085)',
       CASE WHEN count(*) >= 100 THEN 'ok — ' || count(*)::text || ' datas'
            ELSE 'poucas: ' || count(*)::text END
  FROM holidays WHERE is_active
UNION ALL
SELECT '4. quote_date_check removido (086)',
       CASE WHEN count(*) = 0 THEN 'ok' ELSE 'AINDA EXISTE' END
  FROM pg_constraint
 WHERE conrelid = 'transfer_quotes'::regclass AND conname = 'quote_date_check'
UNION ALL
SELECT '5. colunas de split (087)',
       CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FALTA' END
  FROM information_schema.columns
 WHERE table_name = 'payments'
   AND column_name IN ('split_operator_id','split_application_fee');
