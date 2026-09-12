-- ── Passo 2 da 089: MARCAR os serviços adicionais ──────────────────────────
--
-- ⚠️ ESTE ARQUIVO NÃO ESTÁ PRONTO PARA RODAR. A lista de IDs está vazia de
--    propósito. Preencha-a com o resultado conferido de
--    `089_identificar_servicos.sql` e só então execute.
--
-- Por que vazia: não tenho acesso ao banco de produção. Os IDs reais só
-- existem lá — os seeds do repositório contêm apenas transporte de verdade
-- (buggy, jardineira, hilux, quadriciclo, UTV), e "GUIA TURISTICO" foi criado
-- pelo admin em produção. Inventar UUID aqui seria chute.
--
-- Por que por ID e não por nome: um cadastro chamado "Buggy do Guia Pedro"
-- viraria serviço num LIKE '%GUIA%', e o buggy sumiria do catálogo. A decisão
-- de reclassificar dado de produção é humana, uma linha por vez.

BEGIN;

-- ── 1. Confira ANTES o que vai ser alterado ─────────────────────────────────
-- Rode este SELECT primeiro e leia a saída. Se vier linha que você não
-- reconhece, PARE e volte para a consulta de identificação.
SELECT id, name, vehicle_type, seat_capacity, is_transport
FROM vehicles
WHERE id IN (
  -- COLE AQUI OS IDs CONFIRMADOS, um por linha, com vírgula:
  -- '00000000-0000-0000-0000-000000000000',   -- GUIA TURISTICO
  NULL   -- remova esta linha ao preencher
);

-- ── 2. Marque ───────────────────────────────────────────────────────────────
UPDATE vehicles
SET is_transport = FALSE
WHERE id IN (
  -- A MESMA lista do SELECT acima:
  -- '00000000-0000-0000-0000-000000000000',   -- GUIA TURISTICO
  NULL   -- remova esta linha ao preencher
);

-- ── 3. Confira DEPOIS ───────────────────────────────────────────────────────
-- Tem de listar exatamente os cadastros que você pretendia marcar. Nada mais.
SELECT id, name, seat_capacity, is_transport
FROM vehicles WHERE is_transport = FALSE ORDER BY name;

-- Se a saída estiver certa: COMMIT. Se não: ROLLBACK.
-- (Deixado como ROLLBACK de propósito — trocar para COMMIT é um ato consciente.)
ROLLBACK;
-- COMMIT;
