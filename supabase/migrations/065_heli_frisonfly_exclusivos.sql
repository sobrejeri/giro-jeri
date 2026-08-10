-- =============================================================================
-- 065_heli_frisonfly_exclusivos.sql — Voos panorâmicos de helicóptero (Frisonfly)
-- =============================================================================
-- Cadastra os 11 voos da tabela @jerivoospanoramicos como passeios EXCLUSIVOS
-- (is_exclusive = true → venda direta, 1 por vez, NÃO entra no carrinho; ver
-- migration 051).
--
-- COMO O PREÇO FUNCIONA AQUI (importante):
--   • Passeio 01 é COMPARTILHADO e vendido POR PESSOA → o preço fica em
--     tours.shared_price_per_person (R$ 500).
--   • Passeios 02–11 são PRIVATIVOS (3 pax) → o preço NÃO fica no passeio: vem
--     de vehicle_pricing_rules (veículo × passeio). Por isso criamos um veículo
--     "Helicóptero" e uma regra de preço por voo. Sem a regra, o passeio aparece
--     sem valor no app (é a "matriz" veículo × passeio).
--
-- vehicle_type: usamos 'other' + category='Helicóptero' de propósito. Adicionar
-- um valor novo ao enum (ALTER TYPE ... ADD VALUE) NÃO pode ser usado na mesma
-- transação em que é criado, o que quebraria este script no editor SQL.
--
-- Idempotente: pode rodar mais de uma vez sem duplicar.
-- =============================================================================

-- ── 0. Garantias de coluna ───────────────────────────────────────────────────
-- Este script usa colunas de migrations posteriores à 001. Descobrimos que a 023
-- nunca foi aplicada neste banco, então NÃO assumimos que as outras estão lá.
-- Todas são ADD COLUMN IF NOT EXISTS — inofensivo se já existirem.
ALTER TABLE tours ADD COLUMN IF NOT EXISTS region_ids        UUID[] DEFAULT '{}';   -- 028
ALTER TABLE tours ADD COLUMN IF NOT EXISTS min_advance_hours INT;                    -- 049
ALTER TABLE tours ADD COLUMN IF NOT EXISTS is_exclusive      BOOLEAN NOT NULL DEFAULT false; -- 051

-- ── 1. Veículo: helicóptero de 3 lugares ─────────────────────────────────────
INSERT INTO vehicles (
  region_id, name, slug, vehicle_type, category, description,
  seat_capacity, luggage_capacity,
  is_private_allowed, is_shared_allowed, is_transfer_allowed, is_tour_allowed,
  is_active, display_order
)
SELECT
  r.id,
  'Helicóptero (até 3 passageiros)',
  'helicoptero-3-pax',
  'other',
  'Helicóptero',
  'Aeronave para voos panorâmicos e translados aéreos. Capacidade de 3 passageiros por voo.',
  3, 0,
  TRUE, TRUE, TRUE, TRUE,
  TRUE, 50
FROM regions r
WHERE r.slug = 'jericoacoara'
  AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.slug = 'helicoptero-3-pax');

-- ── 2. Os 11 voos como passeios exclusivos ───────────────────────────────────
-- duration_hours = duração TOTAL da experiência (nos voos "com pouso" inclui o
-- tempo de parada em terra; o tempo de voo vai no nome e na descrição).
INSERT INTO tours (
  region_id, region_ids, name, slug, short_description, full_description,
  duration_hours, min_people, max_people,
  is_private_enabled, is_shared_enabled, shared_price_per_person,
  is_exclusive, is_active, display_order, highlight_badge,
  min_advance_hours, meeting_instructions
)
SELECT
  r.id, ARRAY[r.id], v.name, v.slug, v.short_desc, v.full_desc,
  v.dur, 1, v.max_pax,
  v.priv, v.shared, v.shared_price,
  TRUE, TRUE, v.ord, v.badge,
  24, v.meeting
FROM regions r
CROSS JOIN (VALUES
  -- (nome, slug, resumo, descrição completa, duração_h, max_pax, privativo, compartilhado, preço_compartilhado, ordem, selo, instruções)
  ('Voo Panorâmico Compartilhado — 5 min',
   'heli-01-panoramico-compartilhado',
   'Voo panorâmico de 5 minutos. Valor por pessoa — nossa única opção compartilhada.',
   'Voo panorâmico de 5 minutos com partida do Buraco Azul ou Lagun Beach.'
   || E'\n\nEsta é a única opção COMPARTILHADA: o valor é por pessoa.'
   || E'\n\nImportante: o passageiro deve se deslocar até o local de partida por conta própria.',
   0.08::numeric, 3, FALSE, TRUE, 500.00::numeric, 1, 'Compartilhado',
   'Partida do Buraco Azul ou Lagun Beach. O deslocamento até o local de partida é por conta do passageiro.'),

  ('Voo Panorâmico Jeri — 10 min',
   'heli-02-panoramico-jeri-10min',
   'Privativo até 3 pax · 10 min sobre os principais pontos de Jericoacoara.',
   'Sobrevoo de 10 minutos: Parque Nacional · Árvore da Preguiça · Serrote · Farol de Jeri · Pedra Furada · Praia da Malhada · Praia de Jericoacoara · Duna do Pôr do Sol.'
   || E'\n\nVoo privativo para até 3 passageiros.',
   0.17::numeric, 3, TRUE, FALSE, NULL::numeric, 2, NULL,
   'Embarque no heliponto em Jericoacoara.'),

  ('Litoral Oeste — 15 min',
   'heli-03-litoral-oeste-15min',
   'Privativo até 3 pax · 15 min pelo litoral oeste até Tatajuba e Laguna.',
   'Sobrevoo de 15 minutos (Oeste): Parque Nacional · Serrote · Farol de Jeri · Pedra Furada · Praia da Malhada · Praia de Jericoacoara · Duna do Pôr do Sol · Guriu · Mangue Seco · Dunas · Lago Grande · Tatajuba · Laguna.'
   || E'\n\nVoo privativo para até 3 passageiros.',
   0.25::numeric, 3, TRUE, FALSE, NULL::numeric, 3, NULL,
   'Embarque no heliponto em Jericoacoara.'),

  ('Litoral Leste — 15 min',
   'heli-04-litoral-leste-15min',
   'Privativo até 3 pax · 15 min pelas lagoas do litoral leste.',
   'Sobrevoo de 15 minutos (Leste): Parque Nacional · Lagoa do Paraíso · Lagoa Azul · Lagun Beach · Buraco Azul · Praia da Preá · Árvore da Preguiça · Serrote · Farol de Jeri · Pedra Furada · Praia da Malhada · Praia de Jericoacoara · Duna do Pôr do Sol.'
   || E'\n\nVoo privativo para até 3 passageiros.',
   0.25::numeric, 3, TRUE, FALSE, NULL::numeric, 4, NULL,
   'Embarque no heliponto em Jericoacoara.'),

  ('Extremo Leste — 25 min',
   'heli-05-extremo-leste-25min',
   'Privativo até 3 pax · 25 min cobrindo todo o litoral leste.',
   'Sobrevoo de 25 minutos (Extremo Leste): Parque Nacional · Lagoa do Paraíso · Lagoa Azul · Lagun Beach · Buraco Azul · Beira d''Água · Barrinha · Praia da Preá · Árvore da Preguiça · Serrote · Farol de Jeri · Pedra Furada · Praia da Malhada · Praia de Jericoacoara · Duna do Pôr do Sol.'
   || E'\n\nVoo privativo para até 3 passageiros.',
   0.42::numeric, 3, TRUE, FALSE, NULL::numeric, 5, NULL,
   'Embarque no heliponto em Jericoacoara.'),

  ('Lagun Beach com pouso — dia completo',
   'heli-06-lagun-beach-com-pouso',
   'Privativo até 3 pax · 22 min de voo + 4h30 de parada no Buraco Azul.',
   'Saída de Jeri às 10h30 sobrevoando: Parque Nacional · Lagoa do Paraíso · Lagoa Azul · Lagun Beach · Buraco Azul.'
   || E'\n\nParada de 4h30 no Buraco Azul.'
   || E'\n\nRetorno às 15h sobrevoando: Lagun Beach · Praia da Preá · Árvore da Preguiça · Serrote · Farol de Jeri · Pedra Furada · Praia da Malhada · Praia de Jericoacoara · Duna do Pôr do Sol.'
   || E'\n\n22 minutos de voo no total. Voo privativo para até 3 passageiros.',
   4.5::numeric, 3, TRUE, FALSE, NULL::numeric, 6, 'Com pouso',
   'Embarque no heliponto em Jericoacoara às 10h30. Retorno previsto para 15h.'),

  ('Litoral Leste + Oeste — 30 min',
   'heli-07-leste-oeste-30min',
   'Privativo até 3 pax · 30 min · inclui os roteiros 02, 03 e 04.',
   'Sobrevoo de 30 minutos cobrindo Litoral Leste e Litoral Oeste — inclui os roteiros dos voos 02, 03 e 04.'
   || E'\n\nVoo privativo para até 3 passageiros.',
   0.5::numeric, 3, TRUE, FALSE, NULL::numeric, 7, 'Promocional',
   'Embarque no heliponto em Jericoacoara.'),

  ('Laguna / Lago Grande com pouso',
   'heli-08-laguna-com-pouso',
   'Privativo até 3 pax · 25 min de voo + 3h30 de parada no Lago Grande.',
   'Saída de Jeri às 11h30 sobrevoando: Parque Nacional · Serrote · Farol de Jeri · Pedra Furada · Praia da Malhada · Beira Mar de Jeri · Duna do Pôr do Sol · Guriu · Mangue Seco · Dunas · Tatajuba.'
   || E'\n\nParada de 3h30 no Lago Grande.'
   || E'\n\nRetorno às 15h direto para Jeri.'
   || E'\n\n25 minutos de voo no total. Voo privativo para até 3 passageiros.',
   3.5::numeric, 3, TRUE, FALSE, NULL::numeric, 8, 'Com pouso',
   'Embarque no heliponto em Jericoacoara às 11h30. Retorno previsto para 15h.'),

  ('Beira d''Água com pouso',
   'heli-09-beira-dagua-com-pouso',
   'Privativo até 3 pax · 25 min de voo + 4h30 de parada na Beira d''Água.',
   'Saída de Jeri às 10h30 sobrevoando: Parque Nacional · Lagoa do Paraíso · Lagoa Azul · Lagun Beach · Buraco Azul.'
   || E'\n\nParada de 4h30 na Beira d''Água.'
   || E'\n\nRetorno às 15h sobrevoando: Barrinha · Praia da Preá · Árvore da Preguiça · Serrote · Farol de Jeri · Pedra Furada · Praia da Malhada · Praia de Jericoacoara · Duna do Pôr do Sol.'
   || E'\n\n25 minutos de voo no total. Voo privativo para até 3 passageiros.',
   4.5::numeric, 3, TRUE, FALSE, NULL::numeric, 9, 'Com pouso',
   'Embarque no heliponto em Jericoacoara às 10h30. Retorno previsto para 15h.'),

  ('Camocim e Barra Grande — 1h30',
   'heli-10-camocim-barra-grande',
   'Privativo até 3 pax · 1h30 de voo até Camocim e Barra Grande.',
   'Sobrevoo de 1h30: Parque Nacional · Serrote · Farol de Jeri · Pedra Furada · Praia da Malhada · Praia de Jericoacoara · Duna do Pôr do Sol · Guriu · Mangue Seco · Dunas · Lago Grande · Tatajuba · Camocim · Barra Grande.'
   || E'\n\nVoo privativo para até 3 passageiros.',
   1.5::numeric, 3, TRUE, FALSE, NULL::numeric, 10, NULL,
   'Embarque no heliponto em Jericoacoara.'),

  ('Lençóis Maranhenses com pouso',
   'heli-11-lencois-maranhenses',
   'Privativo até 3 pax · 4h de voo + 2h30 em Barreirinhas.',
   'Saída de Jeri às 09h sobrevoando: Parque Nacional · Serrote · Farol de Jeri · Pedra Furada · Praia da Malhada · Praia de Jericoacoara · Duna do Pôr do Sol · Guriu · Mangue Seco · Dunas · Tatajuba · Camocim · Cajueiro da Praia · Barra Grande · Parnaíba · Delta do Parnaíba · Tutóia · Farol de Tutóia · Atins · Parque dos Lençóis · Barreirinhas.'
   || E'\n\nParada de 2h30 em Barreirinhas.'
   || E'\n\nRetorno às 13h30 direto para Jeri.'
   || E'\n\n4 horas de voo no total. Voo privativo para até 3 passageiros.',
   4.5::numeric, 3, TRUE, FALSE, NULL::numeric, 11, 'Com pouso',
   'Embarque no heliponto em Jericoacoara às 09h. Retorno previsto para 13h30.')
) AS v(name, slug, short_desc, full_desc, dur, max_pax, priv, shared, shared_price, ord, badge, meeting)
WHERE r.slug = 'jericoacoara'
ON CONFLICT (slug) DO UPDATE SET
  name                    = EXCLUDED.name,
  short_description       = EXCLUDED.short_description,
  full_description        = EXCLUDED.full_description,
  duration_hours          = EXCLUDED.duration_hours,
  max_people              = EXCLUDED.max_people,
  is_private_enabled      = EXCLUDED.is_private_enabled,
  is_shared_enabled       = EXCLUDED.is_shared_enabled,
  shared_price_per_person = EXCLUDED.shared_price_per_person,
  is_exclusive            = EXCLUDED.is_exclusive,
  is_active               = EXCLUDED.is_active,
  display_order           = EXCLUDED.display_order,
  highlight_badge         = EXCLUDED.highlight_badge,
  min_advance_hours       = EXCLUDED.min_advance_hours,
  meeting_instructions    = EXCLUDED.meeting_instructions,
  region_ids              = EXCLUDED.region_ids,
  updated_at              = NOW();

-- ── 3. Preço dos voos PRIVATIVOS (matriz veículo × passeio) ──────────────────
-- Sem estas regras o passeio privativo aparece SEM valor no app.
INSERT INTO vehicle_pricing_rules (
  vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, is_active
)
SELECT veh.id, r.id, 'tour', t.id, 'per_vehicle', p.price, TRUE
FROM (VALUES
  ('heli-02-panoramico-jeri-10min',   1590.00::numeric),
  ('heli-03-litoral-oeste-15min',     1890.00::numeric),
  ('heli-04-litoral-leste-15min',     1890.00::numeric),
  ('heli-05-extremo-leste-25min',     2590.00::numeric),
  ('heli-06-lagun-beach-com-pouso',   2590.00::numeric),
  ('heli-07-leste-oeste-30min',       2890.00::numeric),
  ('heli-08-laguna-com-pouso',        3990.00::numeric),
  ('heli-09-beira-dagua-com-pouso',   3990.00::numeric),
  ('heli-10-camocim-barra-grande',    8690.00::numeric),
  ('heli-11-lencois-maranhenses',    19990.00::numeric)
) AS p(slug, price)
JOIN tours    t   ON t.slug   = p.slug
JOIN vehicles veh ON veh.slug = 'helicoptero-3-pax'
JOIN regions  r   ON r.slug   = 'jericoacoara'
WHERE NOT EXISTS (
  SELECT 1 FROM vehicle_pricing_rules x
  WHERE x.vehicle_id   = veh.id
    AND x.service_id   = t.id
    AND x.service_type = 'tour'
);

-- Reexecução: se a regra já existe, atualiza o preço (mantém a matriz fiel).
UPDATE vehicle_pricing_rules x
SET base_price = p.price, is_active = TRUE, updated_at = NOW()
FROM (VALUES
  ('heli-02-panoramico-jeri-10min',   1590.00::numeric),
  ('heli-03-litoral-oeste-15min',     1890.00::numeric),
  ('heli-04-litoral-leste-15min',     1890.00::numeric),
  ('heli-05-extremo-leste-25min',     2590.00::numeric),
  ('heli-06-lagun-beach-com-pouso',   2590.00::numeric),
  ('heli-07-leste-oeste-30min',       2890.00::numeric),
  ('heli-08-laguna-com-pouso',        3990.00::numeric),
  ('heli-09-beira-dagua-com-pouso',   3990.00::numeric),
  ('heli-10-camocim-barra-grande',    8690.00::numeric),
  ('heli-11-lencois-maranhenses',    19990.00::numeric)
) AS p(slug, price)
JOIN tours t ON t.slug = p.slug
JOIN vehicles veh ON veh.slug = 'helicoptero-3-pax'
WHERE x.service_id = t.id AND x.service_type = 'tour' AND x.vehicle_id = veh.id;

-- ── Verificação (rode depois) ────────────────────────────────────────────────
--   SELECT t.display_order, t.name, t.is_exclusive,
--          t.shared_price_per_person AS preco_compartilhado,
--          vpr.base_price            AS preco_privativo
--     FROM tours t
--     LEFT JOIN vehicle_pricing_rules vpr
--            ON vpr.service_id = t.id AND vpr.service_type = 'tour'
--    WHERE t.slug LIKE 'heli-%'
--    ORDER BY t.display_order;
--   -- Esperado: 11 linhas. A 01 com preço compartilhado 500 e privativo NULL;
--   -- as outras 10 com preço privativo preenchido e compartilhado NULL.
