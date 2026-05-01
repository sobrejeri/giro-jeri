-- =============================================================
-- GIRO JERI — 005: Dados Reais (Idempotente)
-- Popula: regiao, categorias, veiculos, passeios, horarios,
--         transfers, rotas, regras de preco e configuracoes.
-- Execute no Supabase SQL Editor (ou via Supabase CLI).
-- =============================================================

-- ─── 1. Região ───────────────────────────────────────────────
INSERT INTO regions
  (name, slug, description, city, state, timezone,
   center_latitude, center_longitude, service_radius_km, is_active, sort_order)
VALUES (
  'Jericoacoara', 'jericoacoara',
  'Paraíso dos ventos no litoral oeste do Ceará. Dunas, lagoas cristalinas, pôr do sol único.',
  'Jijoca de Jericoacoara', 'Ceará', 'America/Fortaleza',
  -2.7975, -40.5133, 80.00, TRUE, 1
)
ON CONFLICT (slug) DO UPDATE SET
  description      = EXCLUDED.description,
  center_latitude  = EXCLUDED.center_latitude,
  center_longitude = EXCLUDED.center_longitude,
  is_active        = TRUE;

-- ─── 2. Categorias ───────────────────────────────────────────
INSERT INTO categories
  (name, slug, description, icon, color, category_type, is_active, sort_order)
VALUES
  ('Passeio de Buggy', 'buggy',      'Aventura pelas dunas de buggy',                    'Zap',    '#FF6A00', 'tour',     TRUE, 1),
  ('Pôr do Sol',       'por-do-sol', 'Experiências ao entardecer na Duna do Pôr do Sol', 'Sun',    '#F59E0B', 'tour',     TRUE, 2),
  ('Lagoas',           'lagoas',     'Passeios pelas lagoas cristalinas',                 'Waves',  '#0EA5E9', 'tour',     TRUE, 3),
  ('Passeio de Barco', 'barco',      'Navegação pelas lagoas e rios',                     'Anchor', '#10B981', 'tour',     TRUE, 4),
  ('Transfer',         'transfer',   'Translados e transfers regionais',                  'Car',    '#6366F1', 'transfer', TRUE, 5)
ON CONFLICT (slug) DO UPDATE SET
  name       = EXCLUDED.name,
  icon       = EXCLUDED.icon,
  color      = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  is_active  = TRUE;

-- ─── 3. Veículos ─────────────────────────────────────────────
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
  ('Buggy Turístico (2 pax)',     'buggy-2',           'buggy',
   'Buggy aberto ideal para casais. Perfeito para as dunas.',
   2,  2,  TRUE,  FALSE, FALSE, 1),
  ('Buggy Familiar (4 pax)',      'buggy-4',           'buggy',
   'Buggy 4 lugares — o mais solicitado em Jericoacoara.',
   4,  4,  TRUE,  FALSE, FALSE, 2),
  ('Jardineira Compartilhada',    'jardineira',        'jardineira',
   'Ônibus aberto para passeios compartilhados com outros turistas.',
   16, 8,  FALSE, TRUE,  FALSE, 3),
  ('Hilux 4x4 (5 pax)',           'hilux-4x4',         'hilux_4x4',
   'Toyota Hilux 4x4 com ar-condicionado. Conforto nas trilhas.',
   5,  5,  TRUE,  FALSE, TRUE,  4),
  ('Barco Lagoa Grande (20 pax)', 'barco-lagoa-grande','boat',
   'Barco motorizado para grupos. Navegação na Lagoa Grande.',
   20, 0,  TRUE,  TRUE,  FALSE, 5)
) AS v(name, slug, vtype, descr, seats, luggage, priv, shared, transfer_ok, ord)
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  seat_capacity    = EXCLUDED.seat_capacity,
  luggage_capacity = EXCLUDED.luggage_capacity,
  is_active        = TRUE;

-- ─── 4. Passeios ─────────────────────────────────────────────
WITH
  reg   AS (SELECT id FROM regions    WHERE slug = 'jericoacoara'),
  buggy AS (SELECT id FROM categories WHERE slug = 'buggy'),
  sol   AS (SELECT id FROM categories WHERE slug = 'por-do-sol'),
  lagoa AS (SELECT id FROM categories WHERE slug = 'lagoas'),
  barco AS (SELECT id FROM categories WHERE slug = 'barco')
INSERT INTO tours
  (region_id, category_id, name, slug, short_description, duration_hours,
   is_private_enabled, is_shared_enabled, shared_price_per_person,
   min_people, max_people, is_featured, is_active, display_order,
   includes_text, cancellation_policy_text, difficulty_level, highlight_badge)
VALUES
  (
    (SELECT id FROM reg), (SELECT id FROM buggy),
    'Passeio de Buggy Completo', 'buggy-completo-jericoacoara',
    'Buggy pelas dunas, Lagoa Azul, Lagoa do Paraíso, Pedra Furada e Pôr do Sol.',
    8.00, TRUE, TRUE, 120.00, 2, 8, TRUE, TRUE, 1,
    'Guia, água mineral, paradas para banho',
    'Cancelamento gratuito até 24h antes. Após esse prazo, taxa de 50%.',
    'Fácil', 'Mais Vendido'
  ),
  (
    (SELECT id FROM reg), (SELECT id FROM sol),
    'Pôr do Sol na Duna', 'por-do-sol-duna-jericoacoara',
    'O pôr do sol mais famoso do Brasil na Duna com transfer e drink incluídos.',
    3.00, TRUE, TRUE, 80.00, 1, 6, TRUE, TRUE, 2,
    'Transfer de buggy, drink de boas-vindas, guia',
    'Cancelamento gratuito até 24h antes.',
    'Fácil', 'Imperdível'
  ),
  (
    (SELECT id FROM reg), (SELECT id FROM lagoa),
    'Lagoas Azul e do Paraíso', 'lagoas-azul-paraiso-jericoacoara',
    'Tarde relaxante nas duas lagoas mais famosas de Jericoacoara.',
    4.00, TRUE, TRUE, 90.00, 2, 10, FALSE, TRUE, 3,
    'Transfer de buggy, guia, acesso às lagoas',
    'Cancelamento gratuito até 24h antes.',
    'Fácil', NULL
  ),
  (
    (SELECT id FROM reg), (SELECT id FROM barco),
    'Passeio de Barco — Lagoa Grande', 'passeio-barco-lagoa-grande-jericoacoara',
    'Navegue pelas águas calmas da Lagoa Grande com parada para banho.',
    3.00, TRUE, TRUE, 100.00, 4, 20, FALSE, TRUE, 4,
    'Passeio de barco, guia, colete salva-vidas',
    'Cancelamento gratuito até 24h antes. Sujeito a condições climáticas.',
    'Fácil', 'Família'
  )
ON CONFLICT (slug) DO UPDATE SET
  short_description       = EXCLUDED.short_description,
  shared_price_per_person = EXCLUDED.shared_price_per_person,
  is_featured             = EXCLUDED.is_featured,
  display_order           = EXCLUDED.display_order,
  is_active               = TRUE;

-- ─── 5. Horários dos passeios ────────────────────────────────
-- Limpa e reinserir para evitar duplicatas
DELETE FROM tour_schedules
WHERE tour_id IN (SELECT id FROM tours WHERE region_id = (SELECT id FROM regions WHERE slug = 'jericoacoara'));

WITH
  reg   AS (SELECT id FROM regions WHERE slug = 'jericoacoara'),
  buggy AS (SELECT id FROM tours WHERE slug = 'buggy-completo-jericoacoara'),
  sol   AS (SELECT id FROM tours WHERE slug = 'por-do-sol-duna-jericoacoara'),
  lagoa AS (SELECT id FROM tours WHERE slug = 'lagoas-azul-paraiso-jericoacoara'),
  barco AS (SELECT id FROM tours WHERE slug = 'passeio-barco-lagoa-grande-jericoacoara')
INSERT INTO tour_schedules
  (tour_id, region_id, schedule_name, departure_time, estimated_return_time, active_weekdays, is_active)
VALUES
  ((SELECT id FROM buggy),(SELECT id FROM reg),'Manhã',  '08:00','16:00','{0,1,2,3,4,5,6}',TRUE),
  ((SELECT id FROM sol),  (SELECT id FROM reg),'Tarde',  '16:30','19:30','{0,1,2,3,4,5,6}',TRUE),
  ((SELECT id FROM lagoa),(SELECT id FROM reg),'Manhã',  '09:00','13:00','{0,1,2,3,4,5,6}',TRUE),
  ((SELECT id FROM lagoa),(SELECT id FROM reg),'Tarde',  '13:30','17:30','{0,1,2,3,4,5,6}',TRUE),
  ((SELECT id FROM barco),(SELECT id FROM reg),'Tarde',  '14:00','17:00','{1,2,3,4,5,6}',  TRUE);

-- ─── 6. Transfer principal ───────────────────────────────────
WITH reg AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO transfers
  (region_id, name, slug, short_description, pricing_mode, is_active, display_order)
SELECT reg.id,
  'Transfer Jericoacoara', 'transfer-jericoacoara',
  'Transfers com rotas fixas. Para outros destinos, solicite cotação.',
  'fixed_route', TRUE, 1
FROM reg
ON CONFLICT (slug) DO NOTHING;

-- ─── 7. Rotas de transfer ─────────────────────────────────────
-- Remove rotas antigas e reinserir (sem unique constraint nas rotas)
DELETE FROM transfer_routes
WHERE transfer_id = (SELECT id FROM transfers WHERE slug = 'transfer-jericoacoara');

WITH t AS (SELECT id FROM transfers WHERE slug = 'transfer-jericoacoara')
INSERT INTO transfer_routes
  (transfer_id, origin_name, destination_name, default_price, extra_stop_price, night_fee, is_active)
SELECT t.id, r.orig, r.dest, r.price, r.extra, r.night, TRUE
FROM t, (VALUES
  ('Jericoacoara',                      'Prea',                              200.00, 30.00,  50.00),
  ('Prea',                              'Jericoacoara',                      200.00, 30.00,  50.00),
  ('Jericoacoara',                      'Fortaleza',                         800.00, 80.00, 100.00),
  ('Fortaleza',                         'Jericoacoara',                      800.00, 80.00, 100.00),
  ('Jericoacoara',                      'Aeroporto de Jericoacoara (Cruz)',   150.00, 20.00,  30.00),
  ('Aeroporto de Jericoacoara (Cruz)',  'Jericoacoara',                      150.00, 20.00,  30.00),
  ('Jericoacoara',                      'Camocim',                           250.00, 30.00,  50.00),
  ('Camocim',                           'Jericoacoara',                      250.00, 30.00,  50.00),
  ('Jericoacoara',                      'Tatajuba',                          120.00, 20.00,  30.00),
  ('Tatajuba',                          'Jericoacoara',                      120.00, 20.00,  30.00),
  ('Jericoacoara',                      'Ilha de Jericoacoara (barco)',        80.00,  0.00,   0.00)
) AS r(orig, dest, price, extra, night);

-- ─── 8. Regras de preço por veículo ─────────────────────────
-- Remove regras antigas e reinserir
DELETE FROM vehicle_pricing_rules
WHERE region_id = (SELECT id FROM regions WHERE slug = 'jericoacoara');

WITH
  reg   AS (SELECT id FROM regions WHERE slug = 'jericoacoara'),
  buggy AS (SELECT id FROM tours    WHERE slug = 'buggy-completo-jericoacoara'),
  sol   AS (SELECT id FROM tours    WHERE slug = 'por-do-sol-duna-jericoacoara'),
  lagoa AS (SELECT id FROM tours    WHERE slug = 'lagoas-azul-paraiso-jericoacoara'),
  barco AS (SELECT id FROM tours    WHERE slug = 'passeio-barco-lagoa-grande-jericoacoara'),
  v_b2  AS (SELECT id FROM vehicles WHERE slug = 'buggy-2'),
  v_b4  AS (SELECT id FROM vehicles WHERE slug = 'buggy-4'),
  v_hil AS (SELECT id FROM vehicles WHERE slug = 'hilux-4x4'),
  v_bar AS (SELECT id FROM vehicles WHERE slug = 'barco-lagoa-grande')
INSERT INTO vehicle_pricing_rules
  (vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, high_season_price, is_active)
VALUES
  -- Buggy Completo
  ((SELECT id FROM v_b2),(SELECT id FROM reg),'tour',(SELECT id FROM buggy),'per_vehicle', 350.00, 450.00,TRUE),
  ((SELECT id FROM v_b4),(SELECT id FROM reg),'tour',(SELECT id FROM buggy),'per_vehicle', 500.00, 650.00,TRUE),
  ((SELECT id FROM v_hil),(SELECT id FROM reg),'tour',(SELECT id FROM buggy),'per_vehicle',600.00, 750.00,TRUE),
  -- Pôr do Sol
  ((SELECT id FROM v_b2),(SELECT id FROM reg),'tour',(SELECT id FROM sol),  'per_vehicle', 200.00, 250.00,TRUE),
  ((SELECT id FROM v_b4),(SELECT id FROM reg),'tour',(SELECT id FROM sol),  'per_vehicle', 280.00, 350.00,TRUE),
  ((SELECT id FROM v_hil),(SELECT id FROM reg),'tour',(SELECT id FROM sol), 'per_vehicle', 320.00, 400.00,TRUE),
  -- Lagoas
  ((SELECT id FROM v_b2),(SELECT id FROM reg),'tour',(SELECT id FROM lagoa),'per_vehicle', 250.00, 300.00,TRUE),
  ((SELECT id FROM v_b4),(SELECT id FROM reg),'tour',(SELECT id FROM lagoa),'per_vehicle', 360.00, 450.00,TRUE),
  ((SELECT id FROM v_hil),(SELECT id FROM reg),'tour',(SELECT id FROM lagoa),'per_vehicle',420.00, 520.00,TRUE),
  -- Barco (apenas o barco)
  ((SELECT id FROM v_bar),(SELECT id FROM reg),'tour',(SELECT id FROM barco),'per_vehicle',1200.00,1500.00,TRUE);

-- ─── 9. Alta Temporada ───────────────────────────────────────
DELETE FROM high_season_rules
WHERE region_id = (SELECT id FROM regions WHERE slug = 'jericoacoara');

WITH reg AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO high_season_rules
  (region_id, name, start_date, end_date, additional_type, additional_value, applies_to, is_active)
SELECT reg.id, h.name, h.s::DATE, h.e::DATE, 'percentage', h.pct, 'all', TRUE
FROM reg, (VALUES
  ('Verão / Reveillon 2025-2026', '2025-12-15', '2026-02-28', 20.00),
  ('Julho 2025 — Férias',         '2025-07-01', '2025-07-31', 15.00),
  ('Julho 2026 — Férias',         '2026-07-01', '2026-07-31', 15.00),
  ('Verão / Reveillon 2026-2027', '2026-12-15', '2027-02-28', 20.00)
) AS h(name, s, e, pct);

-- ─── 10. Configurações ───────────────────────────────────────
INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES
  ('platform_name',              'Giro Jeri',         'string',  'Nome da plataforma'),
  ('whatsapp_support_number',    '+5588999999999',    'string',  'Número do suporte WhatsApp'),
  ('booking_deposit_percent',    '30',                'number',  'Percentual de entrada'),
  ('cancellation_tour_hours',    '24',                'number',  'Horas antes p/ cancelamento gratuito de passeio'),
  ('cancellation_transfer_days', '3',                 'number',  'Dias antes p/ cancelamento gratuito de transfer'),
  ('transfer_min_advance_hours', '4',                 'number',  'Antecedência mínima transfer (horas)'),
  ('quote_expiry_hours',         '2',                 'number',  'Horas para cliente aceitar cotação'),
  ('platform_fee_percent',       '7',                 'number',  'Taxa da plataforma (%)'),
  ('gateway_fee_percent',        '3.5',               'number',  'Taxa estimada do gateway (%)'),
  ('max_people_per_booking',     '50',                'number',  'Máximo de pessoas por reserva'),
  ('maintenance_mode',           'false',             'boolean', 'Modo de manutenção')
ON CONFLICT (setting_key) DO NOTHING;

-- ─── Verificação ─────────────────────────────────────────────
SELECT tabela, total FROM (
  SELECT 'regions'              AS tabela, COUNT(*)::int AS total FROM regions
  UNION ALL SELECT 'categories',           COUNT(*)     FROM categories
  UNION ALL SELECT 'vehicles',             COUNT(*)     FROM vehicles
  UNION ALL SELECT 'tours',                COUNT(*)     FROM tours
  UNION ALL SELECT 'tour_schedules',       COUNT(*)     FROM tour_schedules
  UNION ALL SELECT 'transfers',            COUNT(*)     FROM transfers
  UNION ALL SELECT 'transfer_routes',      COUNT(*)     FROM transfer_routes
  UNION ALL SELECT 'pricing_rules',        COUNT(*)     FROM vehicle_pricing_rules
  UNION ALL SELECT 'high_season_rules',    COUNT(*)     FROM high_season_rules
  UNION ALL SELECT 'settings',             COUNT(*)     FROM system_settings
) t ORDER BY tabela;
