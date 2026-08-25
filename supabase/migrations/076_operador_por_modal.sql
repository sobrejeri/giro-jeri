-- =============================================================================
-- 076_operador_por_modal.sql — Cooperativa escolhe MODAL, não veículo a veículo
-- =============================================================================
-- Hoje a frota liberada de cada cooperativa é veículo a veículo
-- (`operator_service_preferences` com entity_type='vehicle'). Com a frota
-- crescendo, virou uma lista longa de chaves para ligar/desligar, e o que o
-- dono realmente quer dizer é mais simples: "esta cooperativa opera terrestre",
-- "aquela opera aéreo".
--
-- Com o modal cadastrável (075), dá para expressar isso direto: a preferência
-- passa a aceitar entity_type='modal', guardando o id do `service_modals`.
--
-- NÃO substitui o filtro por veículo — soma. A distribuição passa a exigir as
-- duas coisas: a cooperativa precisa operar o MODAL da solicitação E não ter
-- desativado os veículos dela. O nível do veículo continua valendo para o
-- ajuste fino (a coop que faz terrestre mas não tem jardineira).
--
-- Opt-out, como o de veículo: sem linha nenhuma, a cooperativa recebe. Ninguém
-- deixa de ser notificado por causa desta migration — o comportamento só muda
-- quando o admin desmarcar um modal para alguém.
--
-- Idempotente.
-- =============================================================================

-- O CHECK da 006 só aceitava tour | vehicle | transfer.
ALTER TABLE operator_service_preferences
  DROP CONSTRAINT IF EXISTS operator_service_preferences_entity_type_check;

ALTER TABLE operator_service_preferences
  ADD CONSTRAINT operator_service_preferences_entity_type_check
  CHECK (entity_type IN ('tour', 'vehicle', 'transfer', 'modal'));

COMMENT ON COLUMN operator_service_preferences.entity_type IS
  'tour | vehicle | transfer | modal. Em ''modal'', entity_id é o id de '
  'service_modals (migration 075): diz em que meio a cooperativa opera.';

-- Busca do roteamento: "quais modais esta cooperativa NÃO opera".
CREATE INDEX IF NOT EXISTS idx_op_prefs_modal
  ON operator_service_preferences (operator_id, entity_id)
  WHERE entity_type = 'modal';

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- O CHECK aceita 'modal':
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname = 'operator_service_preferences_entity_type_check';

-- Quem NÃO opera cada modal (linha só existe quando o admin desmarca):
SELECT u.full_name AS cooperativa, m.name AS modal_desativado
  FROM operator_service_preferences p
  JOIN users u          ON u.id = p.operator_id
  JOIN service_modals m ON m.id = p.entity_id
 WHERE p.entity_type = 'modal' AND p.is_active = FALSE
 ORDER BY 1, 2;
*/
