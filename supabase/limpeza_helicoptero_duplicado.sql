-- =============================================================================
-- limpeza_helicoptero_duplicado.sql — funde o registro `buggy-2` no oficial
-- =============================================================================
-- NÃO é migration: é uma correção de DADOS deste banco, decidida com o dono.
--
-- O que se descobriu: `HELICOPTERO [buggy-2]` é um registro de buggy antigo
-- reaproveitado como helicóptero (o nome mudou, o slug não). Ele tem regras de
-- preço em voos reais e 2 reservas — não é lixo — mas duplica o
-- `helicoptero-3-pax`, e estava com `requires_opt_in = false`: reserva feita
-- com ele era oferecida a TODAS as cooperativas, buggy inclusive.
--
-- Por que FUNDIR e não só desativar: em alguns voos ele é o ÚNICO veículo
-- cadastrado. Desativar sem mais nada deixaria esses voos sem veículo — e sem
-- poder ser reservados, em silêncio.
--
-- Roda dentro de uma transação: ou tudo, ou nada. Rodar duas vezes é inofensivo.
--
-- ANTES de rodar, veja o que vai acontecer (só leitura):
--   SELECT CASE
--            WHEN EXISTS (SELECT 1 FROM vehicle_pricing_rules r2
--                          JOIN vehicles v2 ON v2.id = r2.vehicle_id
--                         WHERE r2.service_id = r.service_id
--                           AND r2.service_type = r.service_type
--                           AND r2.is_active AND v2.slug = 'helicoptero-3-pax')
--            THEN 'DUPLICADA — sera desativada'
--            ELSE 'UNICA — sera transferida para o helicoptero oficial'
--          END || '  ->  ' || coalesce(t.name,'?') AS o_que_acontece
--     FROM vehicle_pricing_rules r
--     JOIN vehicles v ON v.id = r.vehicle_id AND v.slug = 'buggy-2'
--     LEFT JOIN tours t ON r.service_type='tour' AND t.id = r.service_id
--    WHERE r.is_active;
-- =============================================================================

BEGIN;

-- 1. Regras que só o buggy-2 tem: passam para o helicóptero oficial, com o
--    mesmo preço. Sem isso, esses voos ficariam SEM veículo e não dariam para
--    reservar.
UPDATE vehicle_pricing_rules r
   SET vehicle_id = (SELECT id FROM vehicles WHERE slug = 'helicoptero-3-pax')
 WHERE r.is_active
   AND r.vehicle_id = (SELECT id FROM vehicles WHERE slug = 'buggy-2')
   AND NOT EXISTS (
     SELECT 1 FROM vehicle_pricing_rules r2
      WHERE r2.service_id   = r.service_id
        AND r2.service_type = r.service_type
        AND r2.is_active
        AND r2.vehicle_id = (SELECT id FROM vehicles WHERE slug = 'helicoptero-3-pax'));

-- 2. As que sobraram são duplicatas (o oficial já atende aquele serviço).
UPDATE vehicle_pricing_rules
   SET is_active = false
 WHERE is_active
   AND vehicle_id = (SELECT id FROM vehicles WHERE slug = 'buggy-2');

-- 3. As 2 reservas já feitas apontam para o buggy-2 e continuam apontando —
--    histórico não se reescreve. Para elas seguirem chegando em quem opera
--    voo, o opt-in do helicóptero oficial é copiado para ele.
INSERT INTO operator_service_preferences (operator_id, entity_type, entity_id, is_active)
SELECT p.operator_id, 'vehicle', (SELECT id FROM vehicles WHERE slug = 'buggy-2'), p.is_active
  FROM operator_service_preferences p
  JOIN vehicles v ON v.id = p.entity_id
 WHERE p.entity_type = 'vehicle' AND v.slug = 'helicoptero-3-pax'
ON CONFLICT (operator_id, entity_type, entity_id) DO UPDATE SET is_active = EXCLUDED.is_active;

-- 4. Fecha o furo enquanto as reservas antigas correm: sem isto, reserva com
--    este registro é oferecida a TODAS as cooperativas, buggy inclusive.
UPDATE vehicles SET requires_opt_in = true WHERE slug = 'buggy-2';

-- 5. Aposenta o cadastro duplicado.
UPDATE vehicles SET is_active = false WHERE slug = 'buggy-2';

COMMIT;
