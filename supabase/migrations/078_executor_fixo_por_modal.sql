-- =============================================================================
-- 078_executor_fixo_por_modal.sql — Executor fixo e comissões por modal
-- =============================================================================
-- Regra do dono, para o AÉREO: uma única empresa executa (a Frisonfly). Quem
-- aceitar a solicitação fica só com a comissão dela; o restante, descontada a
-- plataforma, vai para quem de fato voa.
--
--   outro operador aceitou → % do operador | % da plataforma | restante executor
--   o executor aceitou     →                 % da plataforma | restante executor
--
-- Fica no MODAL e não na categoria porque é isso que o dono descreveu: "tudo
-- que for aéreo é um único executor". Categoria aérea nova herda a regra sem
-- ninguém precisar lembrar de configurar.
--
-- ESTA MIGRATION NÃO MUDA NENHUM PAGAMENTO. Ela só cria onde guardar a
-- configuração; o split continua exatamente como está até a regra ser ligada,
-- depois de validada com o Mercado Pago. `executor_operator_id` nulo — o padrão
-- para todos os modais — significa "sem executor fixo", o comportamento atual.
--
-- Idempotente.
-- =============================================================================

ALTER TABLE service_modals
  ADD COLUMN IF NOT EXISTS executor_operator_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Comissão de quem ACEITA sem ser o executor. Só faz sentido junto com o
-- executor fixo: sem ele, quem aceita executa e recebe o valor do serviço.
ALTER TABLE service_modals
  ADD COLUMN IF NOT EXISTS acceptor_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Comissão da plataforma NESTE modal. Nulo = usa a configuração geral
-- (`payment_split_admin_pct`). Existe porque um voo de R$ 7.600 não
-- necessariamente cobra o mesmo percentual de um buggy de R$ 400.
ALTER TABLE service_modals
  ADD COLUMN IF NOT EXISTS platform_commission_pct NUMERIC(5,2);

DO $$
BEGIN
  ALTER TABLE service_modals ADD CONSTRAINT service_modals_pct_check
    CHECK (acceptor_commission_pct >= 0 AND acceptor_commission_pct <= 100
           AND (platform_commission_pct IS NULL
                OR (platform_commission_pct >= 0 AND platform_commission_pct <= 100))
           -- As duas comissões juntas não podem passar de 100%: o executor
           -- ficaria com valor negativo, e o split do MP recusa o pagamento
           -- inteiro. Melhor barrar no cadastro do que na hora de cobrar.
           AND (coalesce(platform_commission_pct, 0) + acceptor_commission_pct) <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN service_modals.executor_operator_id IS
  'Cooperativa que EXECUTA todo serviço deste modal, independente de quem '
  'aceitou. Nulo = sem executor fixo (quem aceita executa). Usado no split: o '
  'restante do valor vai para ela.';
COMMENT ON COLUMN service_modals.acceptor_commission_pct IS
  '%% de quem ACEITA a solicitação sem ser o executor fixo. Zero quando o '
  'próprio executor aceita — aí não há intermediário.';
COMMENT ON COLUMN service_modals.platform_commission_pct IS
  '%% da plataforma neste modal. Nulo = usa payment_split_admin_pct.';

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Como cada modal está configurado:
SELECT m.name AS modal,
       coalesce(u.full_name, '(sem executor fixo)') AS executor,
       m.acceptor_commission_pct AS pct_quem_aceita,
       coalesce(m.platform_commission_pct::text, '(geral)') AS pct_plataforma
  FROM service_modals m
  LEFT JOIN users u ON u.id = m.executor_operator_id
 ORDER BY m.sort_order;

-- Para ligar o aéreo na Frisonfly (exemplo — confira o nome antes):
--   UPDATE service_modals
--      SET executor_operator_id = (SELECT id FROM users
--                                   WHERE user_type='operator' AND full_name='Frisonfly'),
--          acceptor_commission_pct = 10,
--          platform_commission_pct = 5
--    WHERE slug = 'aereo';
*/
