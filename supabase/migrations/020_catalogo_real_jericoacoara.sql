-- =============================================================
-- GIRO JERI — 020: Catálogo Real de Jericoacoara (Idempotente)
-- Fonte: levantamento de passeios e translados — referência jun/2026.
-- Preços em FAIXA: piso → base_price (preço normal), teto → high_season_price
-- (a alta temporada soma o % automaticamente via high_season_rules).
-- Requer a migration 005 (cria a região 'jericoacoara' e veículos base).
-- Execute no Supabase SQL Editor.
-- =============================================================

-- ─── 1. Veículos novos / ajustes ─────────────────────────────
-- Habilita a jardineira também em modo privativo (passa a ter os dois)
UPDATE vehicles SET is_private_allowed = TRUE
WHERE slug = 'jardineira';

WITH reg AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO vehicles
  (region_id, name, slug, vehicle_type, description,
   seat_capacity, luggage_capacity,
   is_private_allowed, is_shared_allowed, is_transfer_allowed, is_tour_allowed,
   is_active, display_order)
SELECT
  reg.id, v.name, v.slug, v.vtype::vehicle_type, v.descr,
  v.seats, v.luggage, v.priv, v.shared, v.transfer_ok, TRUE, TRUE, v.ord
FROM reg, (VALUES
  ('Quadriciclo (2 pax)', 'quadriciclo-2', 'quadricycle',
   'Quadriciclo para até 2 pessoas. Você pilota seguindo o guia. Habilitação pode ser exigida.',
   2, 1, TRUE, FALSE, TRUE, 6),
  ('UTV (4 pax)', 'utv-4', 'utv_4',
   'UTV 4 lugares com acompanhamento de guia. Conforto e adrenalina nas dunas.',
   4, 2, TRUE, FALSE, TRUE, 7)
) AS v(name, slug, vtype, descr, seats, luggage, priv, shared, transfer_ok, ord)
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  seat_capacity    = EXCLUDED.seat_capacity,
  luggage_capacity = EXCLUDED.luggage_capacity,
  is_active        = TRUE;

-- ─── 2. Passeios (catálogo real) ─────────────────────────────
WITH
  reg   AS (SELECT id FROM regions    WHERE slug = 'jericoacoara'),
  buggy AS (SELECT id FROM categories WHERE slug = 'buggy'),
  sol   AS (SELECT id FROM categories WHERE slug = 'por-do-sol'),
  lagoa AS (SELECT id FROM categories WHERE slug = 'lagoas')
INSERT INTO tours
  (region_id, category_id, name, slug, short_description, full_description, duration_hours,
   is_private_enabled, is_shared_enabled, shared_price_per_person,
   min_people, max_people, is_featured, is_active, display_order,
   includes_text, excludes_text, cancellation_policy_text, difficulty_level, highlight_badge)
VALUES
  (
    (SELECT id FROM reg), (SELECT id FROM buggy),
    'Litoral Leste Tradicional', 'litoral-leste-tradicional',
    'Árvore da Preguiça, Praia do Preá, Buraco Azul, Lagoa Azul e Lagoa do Paraíso.',
    'O passeio mais clássico de Jericoacoara. Saída por volta das 9h com retorno até as 16h, passando pela Árvore da Preguiça, Praia do Preá, Buraco Azul (ou Lagun Beach), Lagoa Azul, Lagoa do Paraíso e, conforme a época, Lagoa do Amâncio. Disponível em jardineira compartilhada, buggy, quadriciclo, UTV ou 4x4.',
    7.00, TRUE, TRUE, 90.00, 1, 12, TRUE, TRUE, 1,
    'Guia/condutor, roteiro pelas lagoas e praias, paradas para banho',
    'Entrada do Buraco Azul, beach clubs e balneários, alimentação e bebidas, fotos profissionais, atividades aquáticas',
    'Cancelamento gratuito até 24h antes. Após esse prazo, taxa de até 50%.',
    'Fácil', 'Mais Vendido'
  ),
  (
    (SELECT id FROM reg), (SELECT id FROM buggy),
    'Litoral Oeste — Tatajuba', 'litoral-oeste-tatajuba',
    'Mangue Seco, cavalos-marinhos, dunas do Funil, tirolesa e Lago de Tatajuba.',
    'Aventura pelo lado oeste: Praia de Mangue Seco, travessia de balsa no Rio Guriú, passeio ecológico dos cavalos-marinhos, floresta de raízes expostas, Dunas do Funil, tirolesa, toboágua e o Lago Grande de Tatajuba. Saída ~9h, retorno até ~16h.',
    7.00, TRUE, TRUE, 95.00, 1, 12, TRUE, TRUE, 2,
    'Guia/condutor, roteiro de Tatajuba, paradas para banho',
    'Balsa do Rio Guriú (R$35 moto/quadri · R$50 buggy · R$70 carro/UTV), passeio dos cavalos-marinhos, tirolesa, toboágua, fotos no mangue, almoço em Tatajuba',
    'Cancelamento gratuito até 24h antes. Após esse prazo, taxa de até 50%.',
    'Moderado', NULL
  ),
  (
    (SELECT id FROM reg), (SELECT id FROM sol),
    'Extremo Leste — Barrinha', 'extremo-leste-barrinha',
    'Buraco Azul Castelhano, Vila da Barrinha e pôr do sol nas dunas. Só privativo.',
    'Roteiro exclusivo até a Barrinha: Praia do Preá, Buraco Azul Castelhano, beach club da região, Vila da Barrinha, restaurantes (Komaki, Munzuá), Dunas da Barrinha e o pôr do sol nas dunas. Saída ~9h30; com pôr do sol o retorno vai até ~18h35. Passeio normalmente privativo.',
    8.00, TRUE, FALSE, NULL, 1, 6, TRUE, TRUE, 3,
    'Condutor/guia, roteiro até a Barrinha, parada para o pôr do sol',
    'Entradas e consumo em beach clubs e restaurantes, alimentação e bebidas, fotos profissionais',
    'Cancelamento gratuito até 24h antes. Após esse prazo, taxa de até 50%.',
    'Moderado', 'Pôr do Sol'
  ),
  (
    (SELECT id FROM reg), (SELECT id FROM lagoa),
    'Lagoa do Paraíso Exclusiva', 'lagoa-paraiso-exclusiva',
    'Direto para a Lagoa do Paraíso, com mais tempo para relaxar em um só lugar.',
    'Para quem prefere curtir sem pressa: deslocamento direto à Lagoa do Paraíso, permanência maior em um único estabelecimento e retorno. Ideal para quem não quer o roteiro completo do Litoral Leste. Horário flexível, geralmente entre 9h e 15h.',
    5.00, TRUE, TRUE, 85.00, 1, 10, FALSE, TRUE, 4,
    'Transporte ida e volta, tempo livre na lagoa',
    'Entrada/consumo do estabelecimento, alimentação e bebidas, redes e atividades internas',
    'Cancelamento gratuito até 24h antes.',
    'Fácil', NULL
  ),
  (
    (SELECT id FROM reg), (SELECT id FROM lagoa),
    'Lagoa Azul Exclusiva', 'lagoa-azul-exclusiva',
    'Tempo livre na Lagoa Azul, na mesma região de lagoas de Jijoca.',
    'Transporte até a Lagoa Azul com tempo livre para banho e almoço. Pode ser combinada com a Lagoa do Paraíso, que fica na mesma região. Duração aproximada de 4 a 5 horas.',
    4.50, TRUE, TRUE, 85.00, 1, 10, FALSE, TRUE, 5,
    'Transporte ida e volta, tempo livre na lagoa',
    'Entrada/consumo do estabelecimento, alimentação e bebidas, atividades internas',
    'Cancelamento gratuito até 24h antes.',
    'Fácil', NULL
  ),
  (
    (SELECT id FROM reg), (SELECT id FROM lagoa),
    'Buraco Azul / Lagun Beach', 'buraco-azul-lagun-beach',
    'Transporte exclusivo até o Buraco Azul ou Lagun Beach, com tempo livre.',
    'Deslocamento até o Buraco Azul ou Lagun Beach com tempo livre no atrativo. Duração aproximada de 4 a 5 horas. O ingresso do atrativo e o consumo não estão inclusos no transporte.',
    4.50, TRUE, TRUE, 90.00, 1, 10, FALSE, TRUE, 6,
    'Transporte ida e volta',
    'Ingresso do atrativo, alimentação, consumo e atividades internas',
    'Cancelamento gratuito até 24h antes.',
    'Fácil', NULL
  )
ON CONFLICT (slug) DO UPDATE SET
  name                    = EXCLUDED.name,
  short_description       = EXCLUDED.short_description,
  full_description        = EXCLUDED.full_description,
  duration_hours          = EXCLUDED.duration_hours,
  is_shared_enabled       = EXCLUDED.is_shared_enabled,
  shared_price_per_person = EXCLUDED.shared_price_per_person,
  max_people              = EXCLUDED.max_people,
  is_featured             = EXCLUDED.is_featured,
  display_order           = EXCLUDED.display_order,
  includes_text           = EXCLUDED.includes_text,
  excludes_text           = EXCLUDED.excludes_text,
  difficulty_level        = EXCLUDED.difficulty_level,
  highlight_badge         = EXCLUDED.highlight_badge,
  is_active               = TRUE;

-- Atualiza o passeio de Pôr do Sol existente com os dados de referência
UPDATE tours SET
  short_description = 'Pôr do sol nas dunas, Lagoa do Amâncio ou Serrote. De buggy ou quadriciclo.',
  duration_hours    = 2.00,
  max_people        = 6,
  excludes_text     = 'Bebidas e consumo, fotos profissionais'
WHERE slug = 'por-do-sol-duna-jericoacoara';

-- ─── 3. Horários dos novos passeios ──────────────────────────
DELETE FROM tour_schedules
WHERE tour_id IN (
  SELECT id FROM tours WHERE slug IN (
    'litoral-leste-tradicional','litoral-oeste-tatajuba','extremo-leste-barrinha',
    'lagoa-paraiso-exclusiva','lagoa-azul-exclusiva','buraco-azul-lagun-beach'
  )
);

WITH reg AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO tour_schedules
  (tour_id, region_id, schedule_name, departure_time, estimated_return_time, active_weekdays, is_active)
SELECT t.id, reg.id, s.nome, s.saida::time, s.retorno::time, '{0,1,2,3,4,5,6}', TRUE
FROM reg, (VALUES
  ('litoral-leste-tradicional', 'Dia inteiro',     '09:00', '16:00'),
  ('litoral-oeste-tatajuba',    'Dia inteiro',     '09:00', '16:00'),
  ('extremo-leste-barrinha',    'Com pôr do sol',  '09:30', '18:30'),
  ('lagoa-paraiso-exclusiva',   'Manhã',           '09:00', '14:00'),
  ('lagoa-azul-exclusiva',      'Manhã',           '09:00', '13:30'),
  ('buraco-azul-lagun-beach',   'Manhã',           '09:00', '13:30')
) AS s(slug, nome, saida, retorno)
JOIN tours t ON t.slug = s.slug;

-- ─── 4. Regras de preço por veículo (faixas reais) ───────────
-- Remove regras dos passeios que vamos (re)inserir, preservando os demais
DELETE FROM vehicle_pricing_rules
WHERE service_type = 'tour'
  AND service_id IN (
    SELECT id FROM tours WHERE slug IN (
      'litoral-leste-tradicional','litoral-oeste-tatajuba','extremo-leste-barrinha',
      'lagoa-paraiso-exclusiva','lagoa-azul-exclusiva','buraco-azul-lagun-beach',
      'por-do-sol-duna-jericoacoara'
    )
  );

WITH reg AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO vehicle_pricing_rules
  (vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, high_season_price, is_active)
SELECT
  (SELECT id FROM vehicles WHERE slug = p.vslug),
  reg.id, 'tour',
  (SELECT id FROM tours WHERE slug = p.tslug),
  'per_vehicle', p.base, p.high, TRUE
FROM reg, (VALUES
  -- Litoral Leste: buggy 450-700 · jardineira priv 500-750 · 4x4 550-850
  ('litoral-leste-tradicional', 'buggy-2',      420.00, 650.00),
  ('litoral-leste-tradicional', 'buggy-4',      450.00, 700.00),
  ('litoral-leste-tradicional', 'jardineira',   500.00, 750.00),
  ('litoral-leste-tradicional', 'hilux-4x4',    550.00, 850.00),
  ('litoral-leste-tradicional', 'utv-4',        520.00, 800.00),
  -- Litoral Oeste / Tatajuba: buggy 520-750 · jardineira priv 700-900 · 4x4 650-900
  ('litoral-oeste-tatajuba',    'buggy-2',      490.00, 700.00),
  ('litoral-oeste-tatajuba',    'buggy-4',      520.00, 750.00),
  ('litoral-oeste-tatajuba',    'jardineira',   700.00, 900.00),
  ('litoral-oeste-tatajuba',    'hilux-4x4',    650.00, 900.00),
  ('litoral-oeste-tatajuba',    'utv-4',        600.00, 850.00),
  -- Extremo Leste / Barrinha: R$600-1000 por veículo (privativo)
  ('extremo-leste-barrinha',    'buggy-4',      600.00, 1000.00),
  ('extremo-leste-barrinha',    'quadriciclo-2',600.00, 900.00),
  ('extremo-leste-barrinha',    'utv-4',        700.00, 1000.00),
  ('extremo-leste-barrinha',    'hilux-4x4',    650.00, 1000.00),
  -- Lagoa do Paraíso exclusiva: buggy 350-550 · 4x4 450-700
  ('lagoa-paraiso-exclusiva',   'buggy-2',      350.00, 550.00),
  ('lagoa-paraiso-exclusiva',   'buggy-4',      350.00, 550.00),
  ('lagoa-paraiso-exclusiva',   'hilux-4x4',    450.00, 700.00),
  -- Lagoa Azul exclusiva: idem
  ('lagoa-azul-exclusiva',      'buggy-2',      350.00, 550.00),
  ('lagoa-azul-exclusiva',      'buggy-4',      350.00, 550.00),
  ('lagoa-azul-exclusiva',      'hilux-4x4',    450.00, 700.00),
  -- Buraco Azul / Lagun Beach: buggy 350-550 · 4x4 450-700
  ('buraco-azul-lagun-beach',   'buggy-2',      350.00, 550.00),
  ('buraco-azul-lagun-beach',   'buggy-4',      350.00, 550.00),
  ('buraco-azul-lagun-beach',   'hilux-4x4',    450.00, 700.00),
  -- Pôr do Sol: buggy 250-450 · quadriciclo 220-350
  ('por-do-sol-duna-jericoacoara', 'buggy-2',       250.00, 450.00),
  ('por-do-sol-duna-jericoacoara', 'buggy-4',       280.00, 450.00),
  ('por-do-sol-duna-jericoacoara', 'quadriciclo-2', 220.00, 350.00)
) AS p(tslug, vslug, base, high);

-- ─── 5. Transfers: descrição com modalidades ─────────────────
UPDATE transfers SET
  full_description =
    'Translados com preços por veículo (privativo). Opções compartilhadas por pessoa e ' ||
    'destinos sob consulta (Icaraizinho, Delta do Parnaíba, Camocim, Cumbuco, Canoa Quebrada): ' ||
    'solicite uma cotação. Referências: Fortaleza compartilhado R$140–240/pessoa; ' ||
    'Barreirinhas compartilhado R$390–495/pessoa; Parnaíba compartilhado ~R$310/pessoa.'
WHERE slug = 'transfer-jericoacoara';

-- ─── 6. Rotas de transfer (locais + longa distância) ─────────
DELETE FROM transfer_routes
WHERE transfer_id = (SELECT id FROM transfers WHERE slug = 'transfer-jericoacoara');

WITH t AS (SELECT id FROM transfers WHERE slug = 'transfer-jericoacoara')
INSERT INTO transfer_routes
  (transfer_id, origin_name, destination_name, default_price, extra_stop_price, night_fee, is_active)
SELECT t.id, r.orig, r.dest, r.price, r.extra, r.night, TRUE
FROM t, (VALUES
  -- ── Locais ──
  ('Aeroporto de Jericoacoara (Cruz)', 'Jericoacoara',                      300.00, 30.00,  50.00),
  ('Jericoacoara',                     'Aeroporto de Jericoacoara (Cruz)',  300.00, 30.00,  50.00),
  ('Jijoca de Jericoacoara',           'Jericoacoara',                      180.00, 20.00,  30.00),
  ('Jericoacoara',                     'Jijoca de Jericoacoara',            180.00, 20.00,  30.00),
  ('Preá',                             'Jericoacoara',                      150.00, 20.00,  30.00),
  ('Jericoacoara',                     'Preá',                              150.00, 20.00,  30.00),
  ('Lagoa do Paraíso',                 'Jericoacoara',                      200.00, 20.00,  30.00),
  ('Jericoacoara',                     'Lagoa do Paraíso',                  200.00, 20.00,  30.00),
  ('Barrinha',                         'Jericoacoara',                      250.00, 30.00,  40.00),
  ('Jericoacoara',                     'Barrinha',                          250.00, 30.00,  40.00),
  ('Tatajuba',                         'Jericoacoara',                      120.00, 20.00,  30.00),
  ('Jericoacoara',                     'Tatajuba',                          120.00, 20.00,  30.00),
  -- ── Longa distância (privativo, piso da faixa) ──
  ('Fortaleza',                        'Jericoacoara',                      700.00, 80.00, 100.00),
  ('Jericoacoara',                     'Fortaleza',                         700.00, 80.00, 100.00),
  ('Parnaíba (PI)',                    'Jericoacoara',                      750.00, 80.00, 100.00),
  ('Jericoacoara',                     'Parnaíba (PI)',                     750.00, 80.00, 100.00),
  ('Barra Grande (PI)',                'Jericoacoara',                      700.00, 80.00, 100.00),
  ('Jericoacoara',                     'Barra Grande (PI)',                 700.00, 80.00, 100.00),
  ('Barreirinhas (MA)',                'Jericoacoara',                     1250.00,100.00, 120.00),
  ('Jericoacoara',                     'Barreirinhas (MA)',                1250.00,100.00, 120.00),
  ('Camocim',                          'Jericoacoara',                      250.00, 30.00,  50.00),
  ('Jericoacoara',                     'Camocim',                           250.00, 30.00,  50.00),
  ('Icaraizinho de Amontada',          'Jericoacoara',                      600.00, 50.00,  80.00),
  ('Jericoacoara',                     'Icaraizinho de Amontada',           600.00, 50.00,  80.00),
  ('Cumbuco',                          'Jericoacoara',                      900.00, 80.00, 100.00),
  ('Jericoacoara',                     'Cumbuco',                           900.00, 80.00, 100.00),
  ('Canoa Quebrada',                   'Jericoacoara',                     1100.00,100.00, 120.00),
  ('Jericoacoara',                     'Canoa Quebrada',                   1100.00,100.00, 120.00)
) AS r(orig, dest, price, extra, night);

-- ─── 7. Configurações: Taxa de Turismo Sustentável ──────────
INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES
  ('tourism_tax_per_person', '41.50', 'number',
   'Taxa de Turismo Sustentável por pessoa (válida até 10 dias)'),
  ('tourism_tax_note',
   'Isenção para crianças até 12 anos e pessoas com 60 anos ou mais. Taxa municipal vigente em jun/2026.',
   'string', 'Observação sobre a Taxa de Turismo Sustentável')
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  description   = EXCLUDED.description;

-- ─── Verificação ─────────────────────────────────────────────
SELECT tabela, total FROM (
  SELECT 'tours_ativos'      AS tabela, COUNT(*)::int AS total FROM tours WHERE is_active
  UNION ALL SELECT 'vehicles',          COUNT(*) FROM vehicles WHERE is_active
  UNION ALL SELECT 'tour_schedules',    COUNT(*) FROM tour_schedules
  UNION ALL SELECT 'transfer_routes',   COUNT(*) FROM transfer_routes
  UNION ALL SELECT 'pricing_rules',     COUNT(*) FROM vehicle_pricing_rules
) t ORDER BY tabela;
