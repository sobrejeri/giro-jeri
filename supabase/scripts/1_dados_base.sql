-- =============================================================
-- GIRO JERI -- Dados Base (idempotente -- pode rodar N vezes)
-- Regiao . Categorias . Veiculos . Transfers . Temporada . Config
-- =============================================================

-- 1. Regiao
INSERT INTO regions
  (name, slug, description, city, state, timezone,
   center_latitude, center_longitude, service_radius_km, is_active, sort_order)
VALUES (
  'Jericoacoara', 'jericoacoara',
  'Paraiso dos ventos no litoral oeste do Ceara. Dunas, lagoas cristalinas, por do sol unico.',
  'Jijoca de Jericoacoara', 'Ceara', 'America/Fortaleza',
  -2.7975, -40.5133, 80.00, TRUE, 1
)
ON CONFLICT (slug) DO UPDATE SET
  description      = EXCLUDED.description,
  center_latitude  = EXCLUDED.center_latitude,
  center_longitude = EXCLUDED.center_longitude,
  is_active        = TRUE;

-- 2. Categorias
INSERT INTO categories (name, slug, description, icon, color, category_type, is_active, sort_order) VALUES
  ('Passeio de Buggy', 'buggy',      'Aventura pelas dunas de buggy',                   'Zap',    '#FF6A00', 'tour',     TRUE, 1),
  ('Por do Sol',       'por-do-sol', 'Experiencias ao entardecer na Duna do Por do Sol', 'Sun',    '#F59E0B', 'tour',     TRUE, 2),
  ('Lagoas',           'lagoas',     'Passeios pelas lagoas cristalinas',                'Waves',  '#0EA5E9', 'tour',     TRUE, 3),
  ('Passeio de Barco', 'barco',      'Navegacao pelas lagoas e rios',                    'Anchor', '#10B981', 'tour',     TRUE, 4),
  ('Transfer',         'transfer',   'Translados e transfers regionais',                 'Car',    '#6366F1', 'transfer', TRUE, 5)
ON CONFLICT (slug) DO UPDATE SET
  name       = EXCLUDED.name,
  icon       = EXCLUDED.icon,
  color      = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  is_active  = TRUE;

-- Remove categorias antigas (migration 001 inseriu: aventura, lagoa, sunset, familia, etc.)
DELETE FROM categories
WHERE slug NOT IN ('buggy', 'por-do-sol', 'lagoas', 'barco', 'transfer');

-- 3. Veiculos
-- Remove antigos primeiro (NULL slug nao e capturado pelo NOT IN)
DELETE FROM vehicles
WHERE slug IS NULL
   OR slug NOT IN ('buggy-2', 'buggy-4', 'jardineira', 'hilux-4x4', 'barco-lagoa-grande');

WITH reg AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO vehicles
  (region_id, name, slug, vehicle_type, description,
   seat_capacity, luggage_capacity,
   is_private_allowed, is_shared_allowed, is_transfer_allowed, is_tour_allowed,
   is_active, display_order)
SELECT reg.id, v.name, v.slug, v.vtype::vehicle_type, v.descr,
       v.seats, v.luggage, v.priv, v.shared, v.transfer_ok, TRUE, TRUE, v.ord
FROM reg, (VALUES
  ('Buggy Turistico (2 pax)',    'buggy-2',          'buggy',
   'Buggy aberto ideal para casais.',            2, 2,  TRUE,  FALSE, FALSE, 1),
  ('Buggy Familiar (4 pax)',     'buggy-4',          'buggy',
   'Buggy 4 lugares -- o mais solicitado.',      4, 4,  TRUE,  FALSE, FALSE, 2),
  ('Jardineira Compartilhada',   'jardineira',       'jardineira',
   'Onibus aberto para passeios compartilhados.',16, 8, FALSE, TRUE,  FALSE, 3),
  ('Hilux 4x4 (5 pax)',          'hilux-4x4',        'hilux_4x4',
   'Toyota Hilux 4x4 com ar-condicionado.',      5, 5,  TRUE,  FALSE, TRUE,  4),
  ('Barco Lagoa Grande (20 pax)','barco-lagoa-grande','boat',
   'Barco motorizado para grupos.',              20, 0, TRUE,  TRUE,  FALSE, 5)
) AS v(name, slug, vtype, descr, seats, luggage, priv, shared, transfer_ok, ord)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active   = TRUE;

-- 4. Transfer principal
WITH reg AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO transfers
  (region_id, name, slug, short_description, pricing_mode, is_active, display_order)
SELECT reg.id,
  'Transfer Jericoacoara', 'transfer-jericoacoara',
  'Transfers com rotas fixas. Para outros destinos, solicite cotacao.',
  'fixed_route', TRUE, 1
FROM reg
ON CONFLICT (slug) DO NOTHING;

-- 5. Rotas de transfer
WITH t AS (SELECT id FROM transfers WHERE slug = 'transfer-jericoacoara')
INSERT INTO transfer_routes
  (transfer_id, origin_name, destination_name, default_price, extra_stop_price, night_fee, is_active)
SELECT t.id, r.orig, r.dest, r.price, r.extra, r.night, TRUE
FROM t, (VALUES
  ('Jericoacoara',                    'Prea',                             200.00, 30.00,  50.00),
  ('Prea',                            'Jericoacoara',                     200.00, 30.00,  50.00),
  ('Jericoacoara',                    'Fortaleza',                        800.00, 80.00, 100.00),
  ('Fortaleza',                       'Jericoacoara',                     800.00, 80.00, 100.00),
  ('Jericoacoara',                    'Aeroporto de Jericoacoara (Cruz)', 150.00, 20.00,  30.00),
  ('Aeroporto de Jericoacoara (Cruz)','Jericoacoara',                     150.00, 20.00,  30.00),
  ('Jericoacoara',                    'Camocim',                          250.00, 30.00,  50.00),
  ('Camocim',                         'Jericoacoara',                     250.00, 30.00,  50.00),
  ('Jericoacoara',                    'Tatajuba',                         120.00, 20.00,  30.00),
  ('Tatajuba',                        'Jericoacoara',                     120.00, 20.00,  30.00),
  ('Jericoacoara',                    'Ilha de Jericoacoara (barco)',       80.00,  0.00,   0.00)
) AS r(orig, dest, price, extra, night);

-- 6. Alta temporada (delete + insert pois nao tem unique constraint)
DELETE FROM high_season_rules
WHERE region_id = (SELECT id FROM regions WHERE slug = 'jericoacoara');

WITH reg AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO high_season_rules
  (region_id, name, start_date, end_date, additional_type, additional_value, applies_to, is_active)
SELECT reg.id, h.name, h.s::DATE, h.e::DATE, 'percentage', h.pct, 'all', TRUE
FROM reg, (VALUES
  ('Verao / Reveillon 2025-2026', '2025-12-15', '2026-02-28', 20.00),
  ('Julho 2025 -- Ferias',        '2025-07-01', '2025-07-31', 15.00),
  ('Julho 2026 -- Ferias',        '2026-07-01', '2026-07-31', 15.00),
  ('Verao / Reveillon 2026-2027', '2026-12-15', '2027-02-28', 20.00)
) AS h(name, s, e, pct);

-- 7. Configuracoes do sistema
INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES
  ('platform_name',              'Giro Jeri',         'string',  'Nome da plataforma'),
  ('whatsapp_support_number',    '+5588999999999',    'string',  'Numero do suporte WhatsApp'),
  ('booking_deposit_percent',    '30',                'number',  'Percentual de entrada'),
  ('cancellation_tour_hours',    '24',                'number',  'Horas antes p/ cancelamento gratuito de passeio'),
  ('cancellation_transfer_days', '3',                 'number',  'Dias antes p/ cancelamento gratuito de transfer'),
  ('transfer_min_advance_hours', '4',                 'number',  'Antecedencia minima transfer (horas)'),
  ('quote_expiry_hours',         '2',                 'number',  'Horas para cliente aceitar cotacao'),
  ('platform_fee_percent',       '7',                 'number',  'Taxa da plataforma (%)'),
  ('gateway_fee_percent',        '3.5',               'number',  'Taxa estimada do gateway (%)'),
  ('max_people_per_booking',     '50',                'number',  'Maximo de pessoas por reserva'),
  ('maintenance_mode',           'false',             'boolean', 'Modo de manutencao')
ON CONFLICT (setting_key) DO NOTHING;

-- Verificacao final
SELECT 'regions'        AS tabela, COUNT(*) AS total FROM regions
UNION ALL SELECT 'categories',      COUNT(*) FROM categories
UNION ALL SELECT 'vehicles',        COUNT(*) FROM vehicles
UNION ALL SELECT 'transfers',       COUNT(*) FROM transfers
UNION ALL SELECT 'transfer_routes', COUNT(*) FROM transfer_routes
UNION ALL SELECT 'high_season',     COUNT(*) FROM high_season_rules
UNION ALL SELECT 'settings',        COUNT(*) FROM system_settings
ORDER BY tabela;
