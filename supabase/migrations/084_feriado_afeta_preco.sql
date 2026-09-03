-- =============================================================================
-- 084_feriado_afeta_preco.sql — Feriado cadastrado passa a valer no preço
-- =============================================================================
-- `holidays.affects_pricing` nasceu com DEFAULT FALSE, e o motor de preços
-- filtra por ele (`priceEngine.js` → getHolidayAddition). Só que:
--
--   • nenhuma tela liga esse campo — não há controle para ele em lugar nenhum;
--   • só o formulário atual do admin manda `true`, escondido no corpo do POST;
--   • qualquer feriado criado por SQL, por uma versão anterior do formulário ou
--     por chamada direta à API nasce com `false`.
--
-- Resultado: o feriado aparece cadastrado na tela, com o percentual à mostra, e
-- não acontece nada no preço. Nenhum erro, nenhum aviso — o pior tipo de falha.
--
-- Alta temporada não tem campo equivalente: regra ativa vale, ponto. Este
-- migration alinha o feriado a essa lógica.
-- =============================================================================

-- Novos feriados passam a valer por padrão. Desligar continua possível: basta
-- gravar `affects_pricing = false` explicitamente, ou desativar o feriado.
ALTER TABLE holidays ALTER COLUMN affects_pricing SET DEFAULT TRUE;

-- Conserta o que já está cadastrado. A condição é conservadora de propósito:
-- só liga onde há acréscimo REAL a cobrar. Um feriado sem valor (ou com zero)
-- não vira sobretaxa por acidente — pode ter sido cadastrado só para marcar a
-- data no calendário.
UPDATE holidays
   SET affects_pricing = TRUE,
       updated_at      = NOW()
 WHERE affects_pricing = FALSE
   AND is_active
   AND additional_value IS NOT NULL
   AND additional_value <> 0;

-- `additional_type` é anulável e sem padrão. Nulo, o motor cai no ramo de
-- percentual — que é o que o formulário sempre manda. Deixar explícito evita
-- que um INSERT manual com "20" seja lido como R$ 20 fixos em vez de 20%.
UPDATE holidays
   SET additional_type = 'percentage'
 WHERE additional_type IS NULL
   AND additional_value IS NOT NULL;

COMMENT ON COLUMN holidays.affects_pricing IS
  'Este feriado aplica acréscimo no preço. Passou a ser TRUE por padrão na '
  'migration 084: antes nascia FALSE e o feriado ficava cadastrado sem efeito '
  'nenhum, silenciosamente.';

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Feriados e se estão valendo de fato:
SELECT h.name,
       h.holiday_date,
       coalesce(r.name, 'Todas as regiões')            AS regiao,
       h.additional_value                              AS acrescimo,
       h.additional_type                               AS tipo,
       CASE WHEN NOT h.is_active            THEN 'inativo'
            WHEN NOT h.affects_pricing      THEN 'NÃO afeta o preço'
            WHEN h.additional_value IS NULL THEN 'sem valor'
            ELSE 'valendo' END                         AS situacao
  FROM holidays h
  LEFT JOIN regions r ON r.id = h.region_id
 ORDER BY h.holiday_date;

-- Qual acréscimo vale numa data específica (feriado ganha da temporada):
SELECT 'feriado' AS origem, name, additional_value
  FROM holidays
 WHERE holiday_date = DATE '2026-09-07' AND is_active AND affects_pricing
UNION ALL
SELECT 'temporada', name, additional_value
  FROM high_season_rules
 WHERE is_active
   AND (to_char(DATE '2026-09-07', 'MMDD') BETWEEN to_char(start_date, 'MMDD')
                                               AND to_char(end_date,   'MMDD'));
*/
