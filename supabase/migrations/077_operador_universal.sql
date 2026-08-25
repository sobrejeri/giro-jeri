-- =============================================================================
-- 077_operador_universal.sql — Cooperativa que aceita COMBO
-- =============================================================================
-- O combo (pedido com veículos de modais diferentes: buggy + barco) precisava
-- de duas cooperativas, uma por trecho — e isso exigia o motor de pernas
-- (`booking_legs`, 042) ligado, que por sua vez esbarra no split de pagamento
-- entre 2+ cooperativas, hoje bloqueado de propósito em payments.js.
--
-- Caminho mais simples, decidido pelo dono: o combo vai INTEIRO para uma
-- cooperativa só — a "universal", que opera mais de um meio e topa fechar o
-- pedido combinado. Uma cooperativa, um recebedor, split de recebedor único
-- que já funciona hoje. Sem motor de pernas.
--
-- Os dois perfis saem da combinação do que já existe:
--   • categoria única  → opera UM modal (076). Recebe só serviços daquele meio,
--     nunca um combo, porque não conseguiria executar a outra metade.
--   • universal        → opera MAIS DE UM modal e tem `accepts_combos = true`.
--     Recebe os serviços de cada meio que opera E os combos entre eles.
--
-- Por que a flag separada, se "opera 2+ modais" já daria para deduzir: operar
-- barco e buggy não significa querer FECHAR os dois no mesmo passeio, com uma
-- logística só. Uma coisa é atender os dois serviços; outra é assumir o combo.
-- A flag deixa a cooperativa atender os dois sem ser obrigada a topar o combo.
--
-- Default TRUE: nada muda para ninguém ao aplicar. Como o modal também é
-- opt-out (sem linha = opera tudo), hoje todas continuam recebendo tudo — o
-- comportamento só aperta conforme o admin for marcando os meios de cada uma.
--
-- Idempotente.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS accepts_combos BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN users.accepts_combos IS
  'Só para user_type=operator. true = aceita pedido COMBO (veículos de modais '
  'diferentes no mesmo pedido), que vai inteiro para uma cooperativa só. '
  'false = recebe apenas pedidos de um único modal. Combinado com os modais '
  'operados (operator_service_preferences, entity_type=modal, migration 076), '
  'define os dois perfis: categoria única e universal.';

-- Busca do roteamento de combo: "cooperativas ativas que aceitam combo".
CREATE INDEX IF NOT EXISTS idx_users_operador_combo
  ON users (accepts_combos)
  WHERE user_type = 'operator' AND is_active = TRUE;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Perfil de cada cooperativa: quantos meios opera e se topa combo.
-- (sem linha em operator_service_preferences = opera aquele meio — opt-out)
SELECT u.full_name AS cooperativa,
       u.accepts_combos AS aceita_combo,
       (SELECT count(*) FROM service_modals m
         WHERE m.is_active
           AND NOT EXISTS (
             SELECT 1 FROM operator_service_preferences p
              WHERE p.operator_id = u.id AND p.entity_type = 'modal'
                AND p.entity_id = m.id AND p.is_active = FALSE)) AS meios_operados
  FROM users u
 WHERE u.user_type = 'operator' AND u.is_active
 ORDER BY 3 DESC, 1;

-- Quem hoje conseguiria fechar um combo (2+ meios E aceita combo):
-- espera-se pelo menos UMA linha; nenhuma significa combo sem executor.
*/
