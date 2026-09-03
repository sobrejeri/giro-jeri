-- =============================================================================
-- 085_feriados_nacionais.sql — Calendário de feriados e datas comemorativas
-- =============================================================================
-- 21 datas por ano a +15%, em todas as regiões: feriados nacionais, a Data
-- Magna do Ceará, o São João (que no Nordeste move mais que muito feriado
-- nacional) e as datas comemorativas que puxam procura — Mães, Pais,
-- Namorados, Crianças.
--
-- As datas MÓVEIS são calculadas, não digitadas. Carnaval, Sexta-feira Santa,
-- Páscoa e Corpus Christi dependem da Páscoa; Mães e Pais caem no 2º domingo.
-- `holiday_date` é uma DATA exata, com ano — de propósito, senão um feriado de
-- 2026 cobraria em 2027 também. Por isso o intervalo de anos abaixo.
--
--   → PARA GERAR OUTROS ANOS: troque o generate_series e rode de novo.
--     Não duplica o que já existe.
-- =============================================================================

-- Domingo de Páscoa (Meeus/Jones/Butcher). IMMUTABLE porque para um mesmo ano
-- o resultado nunca muda — deixa o Postgres reaproveitar o cálculo.
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

-- ── 1. Insere as datas ──────────────────────────────────────────────────────
WITH anos AS (
  SELECT generate_series(2026, 2030) AS ano        -- ← troque aqui para outros anos
),
calc AS (
  SELECT ano,
         turiva_pascoa(ano) AS pascoa,
         -- 2º domingo: anda até o 1º domingo e soma uma semana.
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
 -- Pula a data que JÁ tem feriado ativo, mesmo com outro nome. Sem isto, um
 -- "Independência" seu a 30% conviveria com um "Independência do Brasil" meu a
 -- 15% na mesma data — e o motor, que desempata pelo mais recente, passaria a
 -- usar o meu. Sua configuração seria trocada em silêncio.
 WHERE NOT EXISTS (
   SELECT 1 FROM holidays h
    WHERE h.holiday_date = dt.d AND h.region_id IS NULL AND h.is_active
 );

-- ── 2. Nunca abaixar o que a temporada já cobrava ───────────────────────────
-- Feriado tem PRECEDÊNCIA e NUNCA soma (priceEngine.js → getDateSurcharge).
-- Natal, Véspera, Réveillon e Ano Novo caem dentro de "Verão / Réveillon"
-- (+20%): deixá-los a 15% BAIXARIA a sobretaxa desses dias justamente nos de
-- maior procura do ano. Aqui cada feriado sobe ao maior percentual entre o dele
-- e o da temporada que o cobre.
--
-- A temporada é RECORRENTE: o ano gravado nela é ignorado, compara-se mês/dia.
-- O CASE trata a virada de ano — "15/12 a 31/01" tem o fim ANTES do início.
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

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT extract(year FROM holiday_date)::int AS ano,
       count(*)                                      AS datas,
       count(*) FILTER (WHERE additional_value > 15) AS elevadas_pela_temporada
  FROM holidays WHERE is_active AND affects_pricing
 GROUP BY 1 ORDER BY 1;

SELECT to_char(holiday_date, 'DD/MM/YYYY') AS data, name, additional_value AS pct
  FROM holidays
 WHERE is_active AND affects_pricing
   AND holiday_date BETWEEN DATE '2026-01-01' AND DATE '2026-12-31'
 ORDER BY holiday_date;
*/
