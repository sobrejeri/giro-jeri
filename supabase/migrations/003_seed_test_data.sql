-- =============================================================================
-- GIRO JERI — Migration 003
-- Dados de teste para desenvolvimento
-- =============================================================================

-- =============================================================================
-- 1. REGIÃO — Jericoacoara
-- =============================================================================

INSERT INTO regions (name, slug, description, city, state, timezone,
                     center_latitude, center_longitude, service_radius_km, is_active, sort_order)
VALUES (
  'Jericoacoara',
  'jericoacoara',
  'Paraíso dos ventos no litoral oeste do Ceará. Dunas, lagoas cristalinas, pôr do sol único e as melhores praias do Brasil.',
  'Jijoca de Jericoacoara',
  'Ceará',
  'America/Fortaleza',
  -2.7975,
  -40.5133,
  80.00,
  TRUE,
  1
)
ON CONFLICT (slug) DO UPDATE SET
  description       = EXCLUDED.description,
  center_latitude   = EXCLUDED.center_latitude,
  center_longitude  = EXCLUDED.center_longitude,
  is_active         = TRUE;

-- =============================================================================
-- 2. CATEGORIAS DE PASSEIOS
-- =============================================================================

INSERT INTO categories (name, slug, description, icon, color, category_type, is_active, sort_order) VALUES
  ('Passeio de Buggy',   'buggy',       'Aventura pelas dunas e praias de buggy',           'Zap',       '#FF6A00', 'tour', TRUE, 1),
  ('Pôr do Sol',         'por-do-sol',  'Experiências únicas ao entardecer na Duna do Pôr do Sol', 'Sunset',    '#F59E0B', 'tour', TRUE, 2),
  ('Lagoas',             'lagoas',      'Passeios pelas lagoas cristalinas da região',       'Waves',     '#0EA5E9', 'tour', TRUE, 3),
  ('Passeio de Barco',   'barco',       'Navegação pelas lagoas e rio Preguiças',            'Anchor',    '#10B981', 'tour', TRUE, 4),
  ('Transfer',           'transfer',    'Translados e transfers regionais',                  'Car',       '#6366F1', 'transfer', TRUE, 5)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 3. PASSEIOS
-- =============================================================================

WITH
  reg  AS (SELECT id FROM regions    WHERE slug = 'jericoacoara'),
  c_buggy   AS (SELECT id FROM categories WHERE slug = 'buggy'),
  c_sol     AS (SELECT id FROM categories WHERE slug = 'por-do-sol'),
  c_lagoa   AS (SELECT id FROM categories WHERE slug = 'lagoas'),
  c_barco   AS (SELECT id FROM categories WHERE slug = 'barco')
INSERT INTO tours
  (region_id, category_id, name, slug, short_description, full_description,
   duration_hours, is_private_enabled, is_shared_enabled, shared_price_per_person,
   min_people, max_people, is_featured, is_active, display_order,
   includes_text, cancellation_policy_text, difficulty_level, highlight_badge)
VALUES
  -- Passeio de Buggy Completo
  (
    (SELECT id FROM reg), (SELECT id FROM c_buggy),
    'Passeio de Buggy Completo — Jericoacoara',
    'buggy-completo-jericoacoara',
    'O clássico passeio de buggy passando por Lagoa Azul, Lagoa do Paraíso, Pedra Furada e Duna do Pôr do Sol.',
    'Embarque de manhã cedo no conforto do seu buggy e explore os principais pontos turísticos de Jericoacoara. Passando pela icônica Pedra Furada, mergulhe nas águas cristalinas da Lagoa Azul e da Lagoa do Paraíso. Finalize o dia com o espetacular pôr do sol na famosa Duna do Pôr do Sol. Guia experiente, água e paradas fotográficas incluídas.',
    8.00,
    TRUE, TRUE, 120.00,
    2, 8,
    TRUE, TRUE, 1,
    'Guia credenciado, água mineral, paradas para banho nas lagoas',
    'Cancelamento gratuito até 24h antes. Após esse prazo, taxa de 50%.',
    'Fácil',
    'Mais Vendido'
  ),
  -- Pôr do Sol na Duna
  (
    (SELECT id FROM reg), (SELECT id FROM c_sol),
    'Pôr do Sol na Duna — Experiência Premium',
    'por-do-sol-duna-jericoacoara',
    'Assista ao pôr do sol mais famoso do Brasil no alto da Duna do Pôr do Sol, com transfer e drink incluídos.',
    'Uma experiência inesquecível ao entardecer. Transfer de buggy até o topo da Duna do Pôr do Sol, onde você assiste ao espetacular poente sobre o oceano e o lago. Um drink de boas-vindas e espaço para fotos do alto das dunas. Ideal para casais e grupos.',
    3.00,
    TRUE, TRUE, 80.00,
    1, 6,
    TRUE, TRUE, 2,
    'Transfer de buggy, drink de boas-vindas, guia local',
    'Cancelamento gratuito até 24h antes.',
    'Fácil',
    'Imperdível'
  ),
  -- Lagoa Azul e Lagoa do Paraíso
  (
    (SELECT id FROM reg), (SELECT id FROM c_lagoa),
    'Lagoas Azul e do Paraíso',
    'lagoas-azul-paraiso-jericoacoara',
    'Tarde relaxante nas duas mais famosas lagoas de Jericoacoara, com água cristalina e cores deslumbrantes.',
    'Passe a tarde explorando as duas joias de Jericoacoara: a Lagoa Azul, com suas águas verde-turquesa rasas e quentes, e a Lagoa do Paraíso, cercada de coqueiros, perfeita para relaxar em redes suspensas sobre a água. Translado de buggy e guia incluídos.',
    4.00,
    TRUE, TRUE, 90.00,
    2, 10,
    FALSE, TRUE, 3,
    'Transfer de buggy, guia, acesso às lagoas',
    'Cancelamento gratuito até 24h antes.',
    'Fácil',
    NULL
  ),
  -- Passeio de Barco — Lagoa Grande
  (
    (SELECT id FROM reg), (SELECT id FROM c_barco),
    'Passeio de Barco — Lagoa Grande',
    'passeio-barco-lagoa-grande-jericoacoara',
    'Navegue pelas águas calmas da Lagoa Grande em uma tarde memorável com parada para banho e kite ao fundo.',
    'Embarque em um confortável barco e navegue pela vasta Lagoa Grande, o paraíso dos kitesurfistas. Faça paradas para nadar nas águas cristalinas, aprecie o visual das dunas ao redor e observe os kitesurfers em pleno voo. Um passeio tranquilo e espetacular para toda a família.',
    3.00,
    TRUE, TRUE, 100.00,
    4, 20,
    FALSE, TRUE, 4,
    'Passeio de barco, guia, colete salva-vidas',
    'Cancelamento gratuito até 24h antes. Sujeito a condições climáticas.',
    'Fácil',
    'Família'
  );

-- =============================================================================
-- 4. HORÁRIOS DOS PASSEIOS
-- =============================================================================

WITH
  t_buggy  AS (SELECT id FROM tours WHERE slug = 'buggy-completo-jericoacoara'),
  t_sol    AS (SELECT id FROM tours WHERE slug = 'por-do-sol-duna-jericoacoara'),
  t_lagoa  AS (SELECT id FROM tours WHERE slug = 'lagoas-azul-paraiso-jericoacoara'),
  t_barco  AS (SELECT id FROM tours WHERE slug = 'passeio-barco-lagoa-grande-jericoacoara'),
  reg      AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO tour_schedules (tour_id, region_id, schedule_name, departure_time, estimated_return_time, active_weekdays, is_active)
VALUES
  -- Buggy Completo — saída manhã todos os dias
  ((SELECT id FROM t_buggy), (SELECT id FROM reg), 'Manhã', '08:00', '16:00', '{0,1,2,3,4,5,6}', TRUE),
  -- Pôr do Sol — tarde todos os dias
  ((SELECT id FROM t_sol),   (SELECT id FROM reg), 'Tarde', '16:30', '19:30', '{0,1,2,3,4,5,6}', TRUE),
  -- Lagoas — manhã e tarde
  ((SELECT id FROM t_lagoa), (SELECT id FROM reg), 'Manhã', '09:00', '13:00', '{0,1,2,3,4,5,6}', TRUE),
  ((SELECT id FROM t_lagoa), (SELECT id FROM reg), 'Tarde', '13:30', '17:30', '{0,1,2,3,4,5,6}', TRUE),
  -- Barco — tarde
  ((SELECT id FROM t_barco), (SELECT id FROM reg), 'Tarde', '14:00', '17:00', '{1,2,3,4,5,6}',   TRUE);

-- =============================================================================
-- 5. VEÍCULOS
-- =============================================================================

WITH reg AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO vehicles
  (region_id, name, slug, vehicle_type, description,
   seat_capacity, luggage_capacity,
   is_private_allowed, is_shared_allowed, is_transfer_allowed, is_tour_allowed,
   is_active, display_order)
VALUES
  (
    (SELECT id FROM reg),
    'Buggy Turístico (2 pax)',
    'buggy-2',
    'buggy',
    'Buggy aberto ideal para casais. Aventura garantida nas dunas com conforto e segurança.',
    2, 2, TRUE, FALSE, FALSE, TRUE, TRUE, 1
  ),
  (
    (SELECT id FROM reg),
    'Buggy Familiar (4 pax)',
    'buggy-4',
    'buggy',
    'Buggy 4 lugares, perfeito para famílias ou grupos. O mais solicitado em Jericoacoara.',
    4, 4, TRUE, FALSE, FALSE, TRUE, TRUE, 2
  ),
  (
    (SELECT id FROM reg),
    'Jardineira Compartilhada',
    'jardineira',
    'jardineira',
    'Ônibus aberto estilo jardineira para passeios compartilhados. Econômico e divertido.',
    16, 8, FALSE, TRUE, FALSE, TRUE, TRUE, 3
  ),
  (
    (SELECT id FROM reg),
    'Hilux 4x4 (5 pax)',
    'hilux-4x4',
    'hilux_4x4',
    'Toyota Hilux 4x4 para passeios e transfers. Confortável, com ar-condicionado.',
    5, 5, TRUE, FALSE, TRUE, TRUE, TRUE, 4
  ),
  (
    (SELECT id FROM reg),
    'Barco Lagoa Grande (20 pax)',
    'barco-lagoa-grande',
    'boat',
    'Barco motorizado para passeios pela Lagoa Grande. Ideal para grupos.',
    20, 0, TRUE, TRUE, FALSE, TRUE, TRUE, 5
  );

-- =============================================================================
-- 6. REGRAS DE PREÇO DOS VEÍCULOS POR PASSEIO
-- =============================================================================

WITH
  reg      AS (SELECT id FROM regions WHERE slug = 'jericoacoara'),
  t_buggy  AS (SELECT id FROM tours WHERE slug = 'buggy-completo-jericoacoara'),
  t_sol    AS (SELECT id FROM tours WHERE slug = 'por-do-sol-duna-jericoacoara'),
  t_lagoa  AS (SELECT id FROM tours WHERE slug = 'lagoas-azul-paraiso-jericoacoara'),
  t_barco  AS (SELECT id FROM tours WHERE slug = 'passeio-barco-lagoa-grande-jericoacoara'),
  v_b2     AS (SELECT id FROM vehicles WHERE slug = 'buggy-2'),
  v_b4     AS (SELECT id FROM vehicles WHERE slug = 'buggy-4'),
  v_jard   AS (SELECT id FROM vehicles WHERE slug = 'jardineira'),
  v_hilux  AS (SELECT id FROM vehicles WHERE slug = 'hilux-4x4'),
  v_barco  AS (SELECT id FROM vehicles WHERE slug = 'barco-lagoa-grande')
INSERT INTO vehicle_pricing_rules
  (vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, high_season_price, is_active)
VALUES
  -- Buggy Completo
  ((SELECT id FROM v_b2),    (SELECT id FROM reg), 'tour', (SELECT id FROM t_buggy), 'per_vehicle', 350.00, 450.00, TRUE),
  ((SELECT id FROM v_b4),    (SELECT id FROM reg), 'tour', (SELECT id FROM t_buggy), 'per_vehicle', 500.00, 650.00, TRUE),
  ((SELECT id FROM v_hilux), (SELECT id FROM reg), 'tour', (SELECT id FROM t_buggy), 'per_vehicle', 600.00, 750.00, TRUE),

  -- Pôr do Sol
  ((SELECT id FROM v_b2),    (SELECT id FROM reg), 'tour', (SELECT id FROM t_sol), 'per_vehicle', 200.00, 250.00, TRUE),
  ((SELECT id FROM v_b4),    (SELECT id FROM reg), 'tour', (SELECT id FROM t_sol), 'per_vehicle', 280.00, 350.00, TRUE),
  ((SELECT id FROM v_hilux), (SELECT id FROM reg), 'tour', (SELECT id FROM t_sol), 'per_vehicle', 320.00, 400.00, TRUE),

  -- Lagoas
  ((SELECT id FROM v_b2),    (SELECT id FROM reg), 'tour', (SELECT id FROM t_lagoa), 'per_vehicle', 250.00, 300.00, TRUE),
  ((SELECT id FROM v_b4),    (SELECT id FROM reg), 'tour', (SELECT id FROM t_lagoa), 'per_vehicle', 360.00, 450.00, TRUE),
  ((SELECT id FROM v_hilux), (SELECT id FROM reg), 'tour', (SELECT id FROM t_lagoa), 'per_vehicle', 420.00, 520.00, TRUE),

  -- Barco Lagoa Grande
  ((SELECT id FROM v_barco), (SELECT id FROM reg), 'tour', (SELECT id FROM t_barco), 'per_vehicle', 1200.00, 1500.00, TRUE);

-- =============================================================================
-- 7. REGRA DE ALTA TEMPORADA (verão + julho)
-- =============================================================================

WITH reg AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO high_season_rules
  (region_id, name, start_date, end_date, additional_type, additional_value, applies_to, is_active)
VALUES
  (
    (SELECT id FROM reg),
    'Verão / Réveillon',
    '2025-12-15',
    '2026-02-28',
    'percentage',
    20.00,
    'all',
    TRUE
  ),
  (
    (SELECT id FROM reg),
    'Julho — Férias Escolares',
    '2025-07-01',
    '2025-07-31',
    'percentage',
    15.00,
    'all',
    TRUE
  ),
  (
    (SELECT id FROM reg),
    'Verão / Réveillon 2026-2027',
    '2026-12-15',
    '2027-02-28',
    'percentage',
    20.00,
    'all',
    TRUE
  )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 8. CONFIGURAÇÕES DO SISTEMA
-- =============================================================================

INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES
  ('platform_name',             'Giro Jeri',     'string',  'Nome da plataforma'),
  ('platform_description',      'Passeios e transfers em Jericoacoara', 'string', 'Descrição curta'),
  ('booking_deposit_percent',   '30',            'number',  'Percentual de entrada para reservas com depósito'),
  ('cancellation_hours_tour',   '24',            'number',  'Horas antes do passeio para cancelamento gratuito'),
  ('cancellation_hours_transfer','72',            'number',  'Horas antes do transfer para cancelamento gratuito'),
  ('max_people_shared_tour',    '20',            'number',  'Máximo de pessoas em passeio compartilhado')
ON CONFLICT (setting_key) DO NOTHING;
