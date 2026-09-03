-- =============================================================================
-- 085_feriados_nacionais.sql — Calendário de feriados e datas comemorativas
-- =============================================================================
-- 21 datas por ano, para 2026, 2027 e 2028, com +15% — todas em "todas as
-- regiões". Inclui os feriados nacionais, a Data Magna do Ceará, o São João
-- (que no Nordeste move mais que muito feriado nacional) e as datas
-- comemorativas que puxam procura: Mães, Pais, Namorados, Crianças.
--
-- POR QUE TRÊS ANOS, E NÃO "TODO ANO": `holidays.holiday_date` é uma DATA
-- exata, com ano — e é assim de propósito, senão "Feriado 07/09/2026" cobraria
-- em 2027 também. Sete das datas ainda MUDAM de ano para ano porque dependem da
-- Páscoa (Carnaval, Sexta-feira Santa, Corpus Christi) ou caem no segundo
-- domingo do mês (Mães, Pais). Não existe fórmula fixa: as datas abaixo foram
-- calculadas pelo algoritmo de Meeus/Jones/Butcher.
--   → Em 2028 é preciso gerar os próximos anos.
--
-- CUIDADO COM A TEMPORADA: feriado tem PRECEDÊNCIA e NUNCA soma
-- (priceEngine.js → getDateSurcharge). Natal, Véspera, Réveillon e Ano Novo
-- caem dentro de "Verão / Réveillon" (+20%): cadastrá-los a 15% BAIXARIA a
-- sobretaxa desses dias de 20% para 15%. O passo 2 corrige isso sozinho,
-- elevando cada feriado ao maior percentual entre o dele e o da temporada que
-- o cobre. Ninguém perde receita por causa deste migration.
--
-- Idempotente: não duplica o que já existir na mesma data com o mesmo nome.
-- =============================================================================

-- ── 1. Insere as datas ──────────────────────────────────────────────────────
WITH datas(d, nome) AS (VALUES
  ('2026-01-01', 'Confraternização Universal (Ano Novo)'),
  ('2026-02-16', 'Carnaval (segunda)'),
  ('2026-02-17', 'Carnaval (terça)'),
  ('2026-03-25', 'Data Magna do Ceará'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-05', 'Páscoa'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-05-10', 'Dia das Mães'),
  ('2026-06-04', 'Corpus Christi'),
  ('2026-06-12', 'Dia dos Namorados'),
  ('2026-06-24', 'São João'),
  ('2026-08-09', 'Dia dos Pais'),
  ('2026-09-07', 'Independência do Brasil'),
  ('2026-10-12', 'N. Sra. Aparecida / Dia das Crianças'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-11-20', 'Consciência Negra'),
  ('2026-12-24', 'Véspera de Natal'),
  ('2026-12-25', 'Natal'),
  ('2026-12-31', 'Réveillon'),
  ('2027-01-01', 'Confraternização Universal (Ano Novo)'),
  ('2027-02-08', 'Carnaval (segunda)'),
  ('2027-02-09', 'Carnaval (terça)'),
  ('2027-03-25', 'Data Magna do Ceará'),
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-03-28', 'Páscoa'),
  ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'),
  ('2027-05-09', 'Dia das Mães'),
  ('2027-05-27', 'Corpus Christi'),
  ('2027-06-12', 'Dia dos Namorados'),
  ('2027-06-24', 'São João'),
  ('2027-08-08', 'Dia dos Pais'),
  ('2027-09-07', 'Independência do Brasil'),
  ('2027-10-12', 'N. Sra. Aparecida / Dia das Crianças'),
  ('2027-11-02', 'Finados'),
  ('2027-11-15', 'Proclamação da República'),
  ('2027-11-20', 'Consciência Negra'),
  ('2027-12-24', 'Véspera de Natal'),
  ('2027-12-25', 'Natal'),
  ('2027-12-31', 'Réveillon'),
  ('2028-01-01', 'Confraternização Universal (Ano Novo)'),
  ('2028-02-28', 'Carnaval (segunda)'),
  ('2028-02-29', 'Carnaval (terça)'),
  ('2028-03-25', 'Data Magna do Ceará'),
  ('2028-04-14', 'Sexta-feira Santa'),
  ('2028-04-16', 'Páscoa'),
  ('2028-04-21', 'Tiradentes'),
  ('2028-05-01', 'Dia do Trabalho'),
  ('2028-05-14', 'Dia das Mães'),
  ('2028-06-12', 'Dia dos Namorados'),
  ('2028-06-15', 'Corpus Christi'),
  ('2028-06-24', 'São João'),
  ('2028-08-13', 'Dia dos Pais'),
  ('2028-09-07', 'Independência do Brasil'),
  ('2028-10-12', 'N. Sra. Aparecida / Dia das Crianças'),
  ('2028-11-02', 'Finados'),
  ('2028-11-15', 'Proclamação da República'),
  ('2028-11-20', 'Consciência Negra'),
  ('2028-12-24', 'Véspera de Natal'),
  ('2028-12-25', 'Natal'),
  ('2028-12-31', 'Réveillon')
)
INSERT INTO holidays (name, holiday_date, region_id, affects_pricing,
                      additional_type, additional_value, affects_availability, is_active)
SELECT dt.nome, dt.d::date, NULL, TRUE, 'percentage'::additional_type, 15, FALSE, TRUE
  FROM datas dt
 -- Pula a data que JÁ tem feriado ativo cadastrado, mesmo com outro nome.
 -- Sem isto, um "Independência" seu a 30% conviveria com um "Independência do
 -- Brasil" meu a 15% na mesma data — e o motor, que desempata pelo mais
 -- recente, passaria a usar o meu. Sua configuração seria trocada em silêncio.
 -- O que ficar de fora aparece na verificação no fim do arquivo.
 WHERE NOT EXISTS (
   SELECT 1 FROM holidays h
    WHERE h.holiday_date = dt.d::date
      AND h.region_id IS NULL
      AND h.is_active
 );

-- ── 2. Nunca abaixar o que a temporada já cobrava ───────────────────────────
-- A temporada é RECORRENTE: o ano gravado nela é ignorado, compara-se mês/dia
-- (mesma regra de priceEngine.js → getSeasonAddition). O CASE trata a virada de
-- ano — "15/12 a 31/01" tem o fim ANTES do início.
UPDATE holidays h
   SET additional_value = s.pct,
       updated_at       = NOW()
  FROM (
    SELECT to_char(hh.holiday_date, 'MMDD') AS md,
           max(r.additional_value)          AS pct
      FROM holidays hh
      JOIN high_season_rules r
        ON r.is_active
       AND r.additional_value IS NOT NULL
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
   AND h.is_active
   AND h.affects_pricing
   AND h.additional_value < s.pct;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Quantos por ano, e quais tiveram o percentual elevado pela temporada:
SELECT extract(year FROM holiday_date)::int AS ano,
       count(*)                             AS datas,
       count(*) FILTER (WHERE additional_value > 15) AS elevadas_pela_temporada
  FROM holidays
 WHERE is_active AND affects_pricing
 GROUP BY 1 ORDER BY 1;

-- Datas do calendário que NÃO foram criadas por já existir feriado ativo nelas
-- (confira se o que está lá é o que você quer):
SELECT holiday_date, name, additional_value AS pct
  FROM holidays
 WHERE is_active
   AND name NOT IN ('Confraternização Universal (Ano Novo)','Carnaval (segunda)',
     'Carnaval (terça)','Data Magna do Ceará','Sexta-feira Santa','Páscoa','Tiradentes',
     'Dia do Trabalho','Dia das Mães','Corpus Christi','Dia dos Namorados','São João',
     'Dia dos Pais','Independência do Brasil','N. Sra. Aparecida / Dia das Crianças',
     'Finados','Proclamação da República','Consciência Negra','Véspera de Natal',
     'Natal','Réveillon')
 ORDER BY holiday_date;

-- O calendário de um ano:
SELECT holiday_date, name, additional_value AS pct
  FROM holidays
 WHERE is_active AND affects_pricing
   AND holiday_date BETWEEN DATE '2026-01-01' AND DATE '2026-12-31'
 ORDER BY holiday_date;
*/
