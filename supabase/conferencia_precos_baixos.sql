-- ─────────────────────────────────────────────────────────────────────────────
-- Preços suspeitos no Motor de Preços — SÓ LEITURA
--
-- O cartão do passeio mostra "A partir de" com o MENOR preço de veículo ativo
-- do serviço. Uma regra de teste de R$ 1 esquecida vira o preço que o cliente
-- vê na vitrine — e ela não aparece na matriz a menos que você role até o
-- veículo certo.
-- ─────────────────────────────────────────────────────────────────────────────

-- Regras com valor baixo demais para ser real:
SELECT t.name                        AS passeio,
       v.name                        AS veiculo,
       r.base_price                  AS preco,
       r.is_active                   AS ativa
  FROM vehicle_pricing_rules r
  JOIN tours    t ON t.id = r.service_id
  LEFT JOIN vehicles v ON v.id = r.vehicle_id
 WHERE r.service_type = 'tour'
   AND r.base_price < 50
 ORDER BY r.base_price, t.name;

-- O "a partir de" que cada passeio ativo mostra hoje na vitrine:
SELECT t.name                                   AS passeio,
       t.is_shared_enabled                      AS compartilhado,
       t.shared_price_per_person                AS por_pessoa,
       min(r.base_price) FILTER (WHERE r.is_active) AS menor_da_frota,
       CASE WHEN t.is_shared_enabled AND t.shared_price_per_person IS NOT NULL
            THEN t.shared_price_per_person || ' por pessoa'
            ELSE coalesce(min(r.base_price) FILTER (WHERE r.is_active)::text, 'sem preço')
       END                                      AS aparece_no_cartao
  FROM tours t
  LEFT JOIN vehicle_pricing_rules r
    ON r.service_id = t.id AND r.service_type = 'tour'
 WHERE t.is_active
 GROUP BY t.id, t.name, t.is_shared_enabled, t.shared_price_per_person
 ORDER BY t.name;
