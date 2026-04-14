-- ============================================================
-- GIRO JERI — Seed de dados de teste
-- Cole no Supabase Dashboard → SQL Editor e execute
-- ============================================================

-- 1. Região
INSERT INTO regions (name, slug, is_active)
VALUES ('Jericoacoara', 'jericoacoara', true)
ON CONFLICT (slug) DO NOTHING;

-- 2. Categorias
INSERT INTO categories (name, slug) VALUES ('Buggy',      'buggy')      ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (name, slug) VALUES ('Barco',      'barco')      ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (name, slug) VALUES ('Lagoas',     'lagoas')     ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (name, slug) VALUES ('Pôr do Sol', 'por-do-sol') ON CONFLICT (slug) DO NOTHING;
INSERT INTO categories (name, slug) VALUES ('UTV',        'utv')        ON CONFLICT (slug) DO NOTHING;

-- 3. Passeios
INSERT INTO tours (name, slug, region_id, category_id, short_description, duration_hours, min_people, max_people, is_active, is_featured, is_shared_enabled, is_private_enabled, shared_price_per_person, highlight_badge, display_order, rating_average, rating_count)
VALUES (
  'Buggy Dunas e Lagoas', 'buggy-dunas-lagoas',
  (SELECT id FROM regions WHERE slug = 'jericoacoara'),
  (SELECT id FROM categories WHERE slug = 'buggy'),
  'Explore as dunas e lagoas de Jericoacoara de buggy com guia especializado.',
  6, 1, 20, true, true, true, true, 120, 'Mais popular', 1, 4.9, 87
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO tours (name, slug, region_id, category_id, short_description, duration_hours, min_people, max_people, is_active, is_featured, is_shared_enabled, is_private_enabled, shared_price_per_person, highlight_badge, display_order, rating_average, rating_count)
VALUES (
  'Pôr do Sol nas Dunas', 'por-do-sol-dunas',
  (SELECT id FROM regions WHERE slug = 'jericoacoara'),
  (SELECT id FROM categories WHERE slug = 'por-do-sol'),
  'Um espetáculo único: assista o pôr do sol do alto das dunas de Jericoacoara.',
  2, 1, 30, true, true, true, true, 80, 'Imperdível', 2, 5.0, 124
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO tours (name, slug, region_id, category_id, short_description, duration_hours, min_people, max_people, is_active, is_featured, is_shared_enabled, is_private_enabled, shared_price_per_person, display_order, rating_average, rating_count)
VALUES (
  'Lagoa do Paraíso', 'lagoa-paraiso',
  (SELECT id FROM regions WHERE slug = 'jericoacoara'),
  (SELECT id FROM categories WHERE slug = 'lagoas'),
  'Águas cristalinas e transparentes na lagoa mais famosa de Jericoacoara.',
  4, 1, 20, true, true, true, true, 95, 3, 4.8, 63
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO tours (name, slug, region_id, category_id, short_description, duration_hours, min_people, max_people, is_active, is_featured, is_shared_enabled, is_private_enabled, shared_price_per_person, display_order, rating_average, rating_count)
VALUES (
  'Passeio de Barco Pedra Furada', 'barco-pedra-furada',
  (SELECT id FROM regions WHERE slug = 'jericoacoara'),
  (SELECT id FROM categories WHERE slug = 'barco'),
  'Navegue até a Pedra Furada e faça snorkel nas águas do litoral cearense.',
  3, 4, 15, true, false, true, false, 110, 4, 4.7, 42
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO tours (name, slug, region_id, category_id, short_description, duration_hours, min_people, max_people, is_active, is_featured, is_shared_enabled, is_private_enabled, highlight_badge, display_order, rating_average, rating_count)
VALUES (
  'Buggy Dia Inteiro', 'buggy-dia-inteiro',
  (SELECT id FROM regions WHERE slug = 'jericoacoara'),
  (SELECT id FROM categories WHERE slug = 'buggy'),
  'O passeio mais completo: dunas, lagoas, praias remotas e pôr do sol tudo em um dia.',
  10, 1, 16, true, true, false, true, 'Exclusivo', 5, 4.9, 31
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO tours (name, slug, region_id, category_id, short_description, duration_hours, min_people, max_people, is_active, is_featured, is_shared_enabled, is_private_enabled, shared_price_per_person, display_order, rating_average, rating_count)
VALUES (
  'Lagoa Azul e Paraíso', 'lagoa-azul-paraiso',
  (SELECT id FROM regions WHERE slug = 'jericoacoara'),
  (SELECT id FROM categories WHERE slug = 'lagoas'),
  'Visite as duas lagoas mais belas da região em um único passeio imperdível.',
  5, 1, 20, true, false, true, true, 130, 6, 4.8, 28
) ON CONFLICT (slug) DO NOTHING;

-- 4. Veículos
INSERT INTO vehicles (name, vehicle_type, seat_capacity, base_price, is_active, is_private_allowed)
VALUES ('Buggy 4 lugares',    'buggy', 4,  480, true, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO vehicles (name, vehicle_type, seat_capacity, base_price, is_active, is_private_allowed)
VALUES ('Buggy 6 lugares',    'buggy', 6,  680, true, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO vehicles (name, vehicle_type, seat_capacity, base_price, is_active, is_private_allowed)
VALUES ('Hilux Cabine Dupla', 'hilux', 5,  550, true, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO vehicles (name, vehicle_type, seat_capacity, base_price, is_active, is_private_allowed)
VALUES ('UTV Side by Side',   'utv',   2,  350, true, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO vehicles (name, vehicle_type, seat_capacity, base_price, is_active, is_private_allowed)
VALUES ('Van Executiva',      'van',   10, 900, true, true) ON CONFLICT (name) DO NOTHING;

-- 5. Vincular veículos aos passeios privativos
INSERT INTO tour_vehicles (tour_id, vehicle_id)
SELECT t.id, v.id FROM tours t CROSS JOIN vehicles v
WHERE t.is_private_enabled = true
ON CONFLICT (tour_id, vehicle_id) DO NOTHING;

-- 6. Transfer
INSERT INTO transfers (name, is_active)
VALUES ('Transfer Padrão', true)
ON CONFLICT (name) DO NOTHING;

-- 7. Rotas de Transfer
INSERT INTO transfer_routes (transfer_id, origin_name, destination_name, default_price, night_fee, extra_stop_price)
VALUES ((SELECT id FROM transfers WHERE name = 'Transfer Padrão'), 'Fortaleza — Aeroporto', 'Jericoacoara',          280, 50, 30) ON CONFLICT (transfer_id, origin_name, destination_name) DO NOTHING;
INSERT INTO transfer_routes (transfer_id, origin_name, destination_name, default_price, night_fee, extra_stop_price)
VALUES ((SELECT id FROM transfers WHERE name = 'Transfer Padrão'), 'Jericoacoara',          'Fortaleza — Aeroporto', 280, 50, 30) ON CONFLICT (transfer_id, origin_name, destination_name) DO NOTHING;
INSERT INTO transfer_routes (transfer_id, origin_name, destination_name, default_price, night_fee, extra_stop_price)
VALUES ((SELECT id FROM transfers WHERE name = 'Transfer Padrão'), 'Fortaleza — Centro',    'Jericoacoara',          260, 50, 30) ON CONFLICT (transfer_id, origin_name, destination_name) DO NOTHING;
INSERT INTO transfer_routes (transfer_id, origin_name, destination_name, default_price, night_fee, extra_stop_price)
VALUES ((SELECT id FROM transfers WHERE name = 'Transfer Padrão'), 'Cumbuco',               'Jericoacoara',          220, 40, 25) ON CONFLICT (transfer_id, origin_name, destination_name) DO NOTHING;
INSERT INTO transfer_routes (transfer_id, origin_name, destination_name, default_price, night_fee, extra_stop_price)
VALUES ((SELECT id FROM transfers WHERE name = 'Transfer Padrão'), 'Jericoacoara',          'Cumbuco',               220, 40, 25) ON CONFLICT (transfer_id, origin_name, destination_name) DO NOTHING;
INSERT INTO transfer_routes (transfer_id, origin_name, destination_name, default_price, night_fee, extra_stop_price)
VALUES ((SELECT id FROM transfers WHERE name = 'Transfer Padrão'), 'Praia do Preá',         'Jericoacoara',           80, 20, 15) ON CONFLICT (transfer_id, origin_name, destination_name) DO NOTHING;

-- Confirmação final
SELECT 'regioes'        AS tabela, count(*) AS total FROM regions
UNION ALL SELECT 'categorias',   count(*) FROM categories
UNION ALL SELECT 'passeios',     count(*) FROM tours
UNION ALL SELECT 'veiculos',     count(*) FROM vehicles
UNION ALL SELECT 'rotas',        count(*) FROM transfer_routes;
