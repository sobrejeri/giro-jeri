-- =============================================================================
-- voo_somente_helicoptero.sql — voo executado só por helicóptero
-- =============================================================================
-- NÃO é migration: correção de DADOS deste banco, decidida com o dono
-- ("o que é voo, quero que seja executado por somente helicóptero e não
-- buggy-2").
--
-- Dois problemas, e nenhum veio das migrations 071–077:
--
--   1. `HELICOPTERO [buggy-2]` é um registro de buggy antigo reaproveitado como
--      helicóptero — o nome mudou, o slug não. Estava cadastrado em voos reais,
--      duplicando o `helicoptero-3-pax`. Em ALGUNS voos era o único veículo:
--      desativar sem mais nada deixaria o voo sem veículo e sem poder ser
--      reservado, em silêncio. Por isso as regras são TRANSFERIDAS, não apagadas.
--
--   2. `requires_opt_in` estava ligado no helicóptero oficial, mas NENHUMA
--      cooperativa tinha sido marcada como operadora dele. A regra "voo só para
--      quem opera voo" nunca esteve em vigor — na prática as reservas de voo
--      caíam para todas as cooperativas. O buggy-2, pior, estava com
--      `requires_opt_in = false` e já tinha 2 reservas.
--
-- Frisonfly como operadora de voo não é chute: está documentado na migration
-- 067 ("quem opera helicóptero é só a Frisonfly"). Se mudar, é trocar o nome
-- no passo B.
--
-- Transação: ou tudo, ou nada. Rodar duas vezes é inofensivo.
--
-- Conferido em Postgres 16, com um voo onde o buggy-2 era o único veículo:
-- depois do script os 4 voos oferecem só o helicóptero, nenhum ficou órfão,
-- e a Frisonfly recebe o voo enquanto a outra cooperativa não recebe.
-- =============================================================================

BEGIN;

-- A. VOO SÓ COM HELICÓPTERO ---------------------------------------------------
-- Onde o buggy-2 é o único veículo do voo, a regra passa para o helicóptero
-- oficial com o mesmo preço (senão o voo ficaria sem veículo e sem reserva).
UPDATE vehicle_pricing_rules r
   SET vehicle_id = (SELECT id FROM vehicles WHERE slug = 'helicoptero-3-pax')
 WHERE r.is_active
   AND r.vehicle_id = (SELECT id FROM vehicles WHERE slug = 'buggy-2')
   AND NOT EXISTS (
     SELECT 1 FROM vehicle_pricing_rules r2
      WHERE r2.service_id = r.service_id AND r2.service_type = r.service_type
        AND r2.is_active
        AND r2.vehicle_id = (SELECT id FROM vehicles WHERE slug = 'helicoptero-3-pax'));

-- As que sobraram são duplicatas: o oficial já atende aquele voo.
UPDATE vehicle_pricing_rules
   SET is_active = false
 WHERE is_active
   AND vehicle_id = (SELECT id FROM vehicles WHERE slug = 'buggy-2');

-- B. QUEM EXECUTA -------------------------------------------------------------
-- `requires_opt_in` estava ligado no helicóptero mas NINGUÉM tinha sido marcado
-- como operador dele — a regra "voo só para quem opera voo" nunca valeu.
-- Vale para os DOIS registros: as 2 reservas antigas apontam para o buggy-2 e
-- precisam continuar chegando na cooperativa certa.
INSERT INTO operator_service_preferences (operator_id, entity_type, entity_id, is_active)
SELECT u.id, 'vehicle', v.id, true
  FROM users u, vehicles v
 WHERE u.user_type = 'operator' AND u.is_active
   AND u.full_name = 'Frisonfly'
   AND v.slug IN ('helicoptero-3-pax', 'buggy-2')
ON CONFLICT (operator_id, entity_type, entity_id) DO UPDATE SET is_active = true;

-- C. FECHA O FURO E APOSENTA O DUPLICADO --------------------------------------
UPDATE vehicles SET requires_opt_in = true  WHERE slug IN ('helicoptero-3-pax', 'buggy-2');
UPDATE vehicles SET is_active       = false WHERE slug = 'buggy-2';

COMMIT;
