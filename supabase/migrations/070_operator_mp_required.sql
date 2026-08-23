-- =============================================================================
-- 070_operator_mp_required.sql — Conta Mercado Pago obrigatória para operar
-- =============================================================================
-- Regra: para ACEITAR uma corrida, o operador (cooperativa com CNPJ ou pessoa
-- física com CPF) precisa ter a conta Mercado Pago conectada. Sem isso o
-- pagamento cai inteiro na conta da plataforma e o operador fica esperando um
-- repasse que o split deveria ter feito sozinho — a inconsistência que esta
-- trava evita.
--
-- A comissão em si já funcionava: users.platform_split_pct (migration 012)
-- define o percentual da plataforma POR OPERADOR, com o padrão global como
-- reserva. Vale para CNPJ e CPF sem alteração, porque é o mesmo user_type.
--
-- EXCEÇÃO: o "operador da casa" — quando a própria plataforma opera as corridas
-- e paga os motoristas por fora (aba Repasses). Nesse caso o dinheiro deve
-- mesmo ficar na conta da plataforma, e exigir MP não faria sentido: seria a
-- plataforma pagando comissão a si mesma. O admin marca essas contas aqui.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mp_payout_exempt BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.mp_payout_exempt IS
  'TRUE = operador dispensado de conectar o Mercado Pago (operação própria da '
  'plataforma, com repasse manual). FALSE (padrão) = precisa conectar para aceitar corridas.';
