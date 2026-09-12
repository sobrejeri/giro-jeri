-- ── 089_veiculo_vs_servico.sql ─────────────────────────────────────────────
-- Separa TRANSPORTE de SERVIÇO ADICIONAL dentro de `vehicles`.
--
-- Problema: o catálogo de veículos não distingue as duas coisas. Um cadastro
-- como "GUIA TURISTICO" entra na tabela com `seat_capacity` obrigatório (a
-- coluna é NOT NULL CHECK > 0), então o app o trata como transporte:
--   • exibe "Até 1 pessoa" e cobra "/veículo";
--   • soma 1 assento na capacidade da combinação;
--   • pode RECOMENDÁ-LO como o veículo mais barato que cabe 1 pessoa.
--
-- A coluna nasce TRUE para todo mundo, então nada muda de comportamento até
-- que o admin marque explicitamente quais cadastros são serviço. Não há
-- backfill por heurística de nome: adivinhar pelo texto ("GUIA", "SERVIÇO")
-- reclassificaria dado de produção sem confirmação humana.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS is_transport BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN vehicles.is_transport IS
  'TRUE = veículo de transporte (conta assentos, entra na recomendação). '
  'FALSE = serviço adicional (guia, ingresso, etc): nunca conta assento nem '
  'é recomendado como transporte.';

-- Listar só transporte é o caminho quente de toda tela de seleção.
CREATE INDEX IF NOT EXISTS idx_vehicles_transport
  ON vehicles (region_id, is_transport)
  WHERE is_active = TRUE;
