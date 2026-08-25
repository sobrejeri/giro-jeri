-- =============================================================================
-- 074_modal_aquatico.sql — Terceiro modal: aquático
-- =============================================================================
-- A 073 abriu o eixo do modal com dois valores (terrestre, aéreo). Falta o
-- aquático: barco, lancha, catamarã — a frota que atende travessia e passeio
-- de água, e que não deve aparecer num serviço de estrada nem o contrário.
--
-- Só amplia o CHECK e a documentação. **Nenhum veículo muda de modal aqui** —
-- ver a nota no fim, que explica por que o barco NÃO é reclassificado
-- automaticamente.
--
-- Idempotente.
-- =============================================================================

-- DROP + ADD em vez de "criar se não existir": a 073 já criou a constraint com
-- dois valores, e uma constraint existente nunca seria atualizada por um
-- ADD ... EXCEPTION duplicate_object. Assim esta migration converge sempre,
-- rodando uma ou dez vezes.
ALTER TABLE vehicles   DROP CONSTRAINT IF EXISTS vehicles_modal_check;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_modal_check;
ALTER TABLE transfers  DROP CONSTRAINT IF EXISTS transfers_modal_check;

ALTER TABLE vehicles   ADD CONSTRAINT vehicles_modal_check
  CHECK (modal IN ('terrestre', 'aereo', 'aquatico'));
ALTER TABLE categories ADD CONSTRAINT categories_modal_check
  CHECK (modal IN ('terrestre', 'aereo', 'aquatico'));
ALTER TABLE transfers  ADD CONSTRAINT transfers_modal_check
  CHECK (modal IN ('terrestre', 'aereo', 'aquatico'));

COMMENT ON COLUMN vehicles.modal IS
  'terrestre | aereo | aquatico — em que meio o veículo opera. Cruzado com '
  'is_tour_allowed/is_transfer_allowed, dá as combinações do negócio.';
COMMENT ON COLUMN categories.modal IS
  'terrestre | aereo | aquatico — modal dos PASSEIOS desta categoria. '
  'O app só oferece veículos do mesmo modal.';
COMMENT ON COLUMN transfers.modal IS
  'terrestre | aereo | aquatico — modal das ROTAS desta categoria de translado.';

-- =============================================================================
-- POR QUE O BARCO NÃO É RECLASSIFICADO AQUI
-- =============================================================================
-- Seria fácil rodar  UPDATE vehicles SET modal='aquatico' WHERE vehicle_type='boat'
-- — e seria perigoso. Se hoje existe passeio que oferece barco E buggy na mesma
-- matriz de preços (uma etapa de água dentro de um roteiro de terra), mover só
-- o barco o faria SUMIR da lista daquele passeio, sem aviso nenhum: o serviço
-- continuaria terrestre e o barco deixaria de casar.
--
-- Reclassificar é decisão de quem conhece a operação, e é de um clique na tela
-- de Catálogo. O caminho seguro é fazer os dois lados juntos:
--   1. marcar a CATEGORIA do serviço de água como 'aquatico';
--   2. marcar os VEÍCULOS de água como 'aquatico'.
--
-- Enquanto ninguém marcar nada, tudo segue exatamente como está hoje.
--
-- Para ver o que seria afetado ANTES de mexer (só leitura):
/*
-- Veículos de água e onde eles estão sendo oferecidos hoje:
SELECT v.name AS veiculo, v.modal AS modal_atual,
       vpr.service_type,
       COALESCE(t.name, rr.origin_name || ' -> ' || rr.destination_name) AS servico,
       COALESCE(c.name,  tr.name)  AS categoria,
       COALESCE(c.modal, tr.modal) AS modal_da_categoria
  FROM vehicles v
  LEFT JOIN vehicle_pricing_rules vpr ON vpr.vehicle_id = v.id AND vpr.is_active
  LEFT JOIN tours t            ON vpr.service_type = 'tour'     AND t.id  = vpr.service_id
  LEFT JOIN categories c       ON c.id = t.category_id
  LEFT JOIN transfer_routes rr ON vpr.service_type = 'transfer' AND rr.id = vpr.service_id
  LEFT JOIN transfers tr       ON tr.id = rr.transfer_id
 WHERE v.is_active
   AND (v.vehicle_type = 'boat' OR v.name ILIKE '%barco%' OR v.name ILIKE '%lancha%'
        OR v.name ILIKE '%catamar%' OR v.name ILIKE '%escuna%')
 ORDER BY v.name;

-- Se a lista acima mostrar SÓ serviços de água, dá para reclassificar em massa:
--   UPDATE vehicles SET modal = 'aquatico' WHERE vehicle_type = 'boat';
--   UPDATE categories SET modal = 'aquatico' WHERE slug IN (...);
--   UPDATE transfers  SET modal = 'aquatico' WHERE slug IN (...);
*/

-- =============================================================================
-- VERIFICAÇÃO (espera os três valores aceitos e nenhum veículo movido)
-- =============================================================================
/*
SELECT modal, count(*) FROM vehicles GROUP BY modal ORDER BY modal;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname IN ('vehicles_modal_check','categories_modal_check','transfers_modal_check');
*/
