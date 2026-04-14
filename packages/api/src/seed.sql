-- ============================================================
-- GIRO JERI — Seed de dados de teste
-- Cole no Supabase Dashboard → SQL Editor e execute
-- ============================================================

-- 1. Região
INSERT INTO regions (name, slug, is_active)
VALUES ('Jericoacoara', 'jericoacoara', true)
ON CONFLICT (slug) DO NOTHING;

-- 2. Categorias
INSERT INTO categories (name, slug, display_order) VALUES
  ('Buggy',      'buggy',       1),
  ('Barco',      'barco',       2),
  ('Lagoas',     'lagoas',      3),
  ('Pôr do Sol', 'por-do-sol',  4),
  ('UTV',        'utv',         5)
ON CONFLICT (slug) DO NOTHING;

-- 3. Passeios
INSERT INTO tours (
  name, slug, region_id, category_id,
  short_description, duration_hours, min_people, max_people,
  is_active, is_featured,
  is_shared_enabled, is_private_enabled,
  shared_price_per_person,
  highlight_badge, display_order,
  rating_average, rating_count, tags
)
SELECT
  t.name, t.slug,
  (SELECT id FROM regions WHERE slug = 'jericoacoara'),
  (SELECT id FROM categories WHERE slug = t.cat_slug),
  t.short_description, t.duration_hours, t.min_people, t.max_people,
  true, t.is_featured,
  t.is_shared_enabled, t.is_private_enabled,
  t.shared_price_per_person,
  t.highlight_badge, t.display_order,
  t.rating_average, t.rating_count, t.tags::text[]
FROM (VALUES
  ('Buggy Dunas e Lagoas',       'buggy-dunas-lagoas',   'buggy',
   'Explore as dunas e lagoas de Jericoacoara de buggy com guia especializado.',
   6, 1, 20, true, true, true, 120::numeric, 'Mais popular', 1, 4.9, 87,
   ARRAY['dunas','lagoas','aventura']),

  ('Pôr do Sol nas Dunas',       'por-do-sol-dunas',     'por-do-sol',
   'Um espetáculo único: assista o pôr do sol do alto das dunas.',
   2, 1, 30, true, true, true, 80::numeric, 'Imperdível', 2, 5.0, 124,
   ARRAY['por-do-sol','romantico','dunas']),

  ('Lagoa do Paraíso',           'lagoa-paraiso',        'lagoas',
   'Águas cristalinas e transparentes na lagoa mais famosa de Jericoacoara.',
   4, 1, 20, true, true, true, 95::numeric, NULL, 3, 4.8, 63,
   ARRAY['lagoa','natureza','banho']),

  ('Passeio de Barco Pedra Furada','barco-pedra-furada', 'barco',
   'Navegue até a Pedra Furada e faça snorkel nas águas do litoral cearense.',
   3, 4, 15, false, true, false, 110::numeric, NULL, 4, 4.7, 42,
   ARRAY['barco','snorkel']),

  ('Buggy Dia Inteiro',          'buggy-dia-inteiro',    'buggy',
   'O passeio mais completo: dunas, lagoas, praias remotas e pôr do sol.',
   10, 1, 16, true, false, true, NULL, 'Exclusivo', 5, 4.9, 31,
   ARRAY['buggy','dia-inteiro','privativo']),

  ('Lagoa Azul e Paraíso',       'lagoa-azul-paraiso',  'lagoas',
   'Visite as duas lagoas mais belas da região em um único passeio.',
   5, 1, 20, false, true, true, 130::numeric, NULL, 6, 4.8, 28,
   ARRAY['lagoas','natureza'])
) AS t(name, slug, cat_slug, short_description, duration_hours, min_people, max_people,
       is_featured, is_shared_enabled, is_private_enabled, shared_price_per_person,
       highlight_badge, display_order, rating_average, rating_count, tags)
ON CONFLICT (slug) DO NOTHING;

-- 4. Veículos
INSERT INTO vehicles (name, vehicle_type, seat_capacity, base_price, is_active, is_private_allowed)
VALUES
  ('Buggy 4 lugares',    'buggy', 4,  480,  true, true),
  ('Buggy 6 lugares',    'buggy', 6,  680,  true, true),
  ('Hilux Cabine Dupla', 'hilux', 5,  550,  true, true),
  ('UTV Side by Side',   'utv',   2,  350,  true, true),
  ('Van Executiva',      'van',   10, 900,  true, true)
ON CONFLICT (name) DO NOTHING;

-- 5. Vincular veículos aos passeios privativos
INSERT INTO tour_vehicles (tour_id, vehicle_id)
SELECT t.id, v.id
FROM tours t
CROSS JOIN vehicles v
WHERE t.is_private_enabled = true
ON CONFLICT (tour_id, vehicle_id) DO NOTHING;

-- 6. Transfer (serviço)
INSERT INTO transfers (name, is_active)
VALUES ('Transfer Padrão', true)
ON CONFLICT (name) DO NOTHING;

-- 7. Rotas de Transfer
INSERT INTO transfer_routes (transfer_id, origin_name, destination_name, default_price, night_fee, extra_stop_price)
SELECT
  (SELECT id FROM transfers WHERE name = 'Transfer Padrão'),
  r.origin, r.destination, r.price, r.night_fee, r.extra
FROM (VALUES
  ('Fortaleza — Aeroporto', 'Jericoacoara',          280, 50, 30),
  ('Jericoacoara',          'Fortaleza — Aeroporto', 280, 50, 30),
  ('Fortaleza — Centro',    'Jericoacoara',          260, 50, 30),
  ('Cumbuco',               'Jericoacoara',          220, 40, 25),
  ('Jericoacoara',          'Cumbuco',               220, 40, 25),
  ('Praia do Preá',         'Jericoacoara',          80,  20, 15)
) AS r(origin, destination, price, night_fee, extra)
ON CONFLICT (transfer_id, origin_name, destination_name) DO NOTHING;

-- Confirmar
SELECT 'regioes' as tabela, count(*) FROM regions
UNION ALL SELECT 'categorias', count(*) FROM categories
UNION ALL SELECT 'passeios', count(*) FROM tours
UNION ALL SELECT 'veiculos', count(*) FROM vehicles
UNION ALL SELECT 'rotas_transfer', count(*) FROM transfer_routes;
