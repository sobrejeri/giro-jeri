-- ═══════════════════════════════════════════════════════════════
-- GIRO JERI — Passeios Base (4 passeios + horários + preços)
-- Idempotente — pode rodar várias vezes
-- Requer: 1_dados_base.sql já executado
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Passeios ───────────────────────────────────────────────────
WITH
  reg   AS (SELECT id FROM regions    WHERE slug = 'jericoacoara'),
  buggy AS (SELECT id FROM categories WHERE slug = 'buggy'),
  sol   AS (SELECT id FROM categories WHERE slug = 'por-do-sol'),
  lagoa AS (SELECT id FROM categories WHERE slug = 'lagoas'),
  barco AS (SELECT id FROM categories WHERE slug = 'barco')
INSERT INTO tours
  (region_id, category_id, name, slug, short_description, full_description,
   duration_hours, is_private_enabled, is_shared_enabled, shared_price_per_person,
   min_people, max_people, is_featured, is_active, display_order,
   includes_text, cancellation_policy_text, difficulty_level, highlight_badge)
VALUES
  (
    (SELECT id FROM reg), (SELECT id FROM buggy),
    'Passeio de Buggy Completo', 'buggy-completo-jericoacoara',
    'Passeio de buggy pelas dunas, Lagoa Azul, Lagoa do Paraíso, Pedra Furada e Pôr do Sol.',
    'Embarque de manhã cedo no seu buggy e explore os principais pontos turísticos de Jericoacoara. Pedra Furada, Lagoa Azul, Lagoa do Paraíso e o espetacular pôr do sol na Duna. Guia, água e paradas fotográficas incluídas.',
    8.00, TRUE, TRUE, 120.00, 2, 8, TRUE, TRUE, 1,
    'Guia credenciado, água mineral, paradas para banho',
    'Cancelamento gratuito até 24h antes. Após esse prazo, taxa de 50%.',
    'Fácil', 'Mais Vendido'
  ),
  (
    (SELECT id FROM reg), (SELECT id FROM sol),
    'Pôr do Sol na Duna', 'por-do-sol-duna-jericoacoara',
    'Assista ao pôr do sol mais famoso do Brasil na Duna com transfer e drink incluídos.',
    'Transfer de buggy até o topo da Duna do Pôr do Sol. Assista ao espetacular poente sobre o oceano. Drink de boas-vindas e espaço para fotos. Ideal para casais e grupos.',
    3.00, TRUE, TRUE, 80.00, 1, 6, TRUE, TRUE, 2,
    'Transfer de buggy, drink de boas-vindas, guia local',
    'Cancelamento gratuito até 24h antes.',
    'Fácil', 'Imperdível'
  ),
  (
    (SELECT id FROM reg), (SELECT id FROM lagoa),
    'Lagoas Azul e do Paraíso', 'lagoas-azul-paraiso-jericoacoara',
    'Tarde relaxante nas duas lagoas mais famosas de Jericoacoara.',
    'Lagoa Azul: águas verde-turquesa rasas e quentes. Lagoa do Paraíso: cercada de coqueiros, com redes sobre a água. Translado de buggy e guia incluídos.',
    4.00, TRUE, TRUE, 90.00, 2, 10, FALSE, TRUE, 3,
    'Transfer de buggy, guia, acesso às lagoas',
    'Cancelamento gratuito até 24h antes.',
    'Fácil', NULL
  ),
  (
    (SELECT id FROM reg), (SELECT id FROM barco),
    'Passeio de Barco — Lagoa Grande', 'passeio-barco-lagoa-grande-jericoacoara',
    'Navegue pelas águas calmas da Lagoa Grande com parada para banho e kite ao fundo.',
    'Barco confortável pela vasta Lagoa Grande — paraíso dos kitesurfistas. Paradas para nadar, vista das dunas e kitesurfers em pleno voo. Tranquilo e espetacular para toda a família.',
    3.00, TRUE, TRUE, 100.00, 4, 20, FALSE, TRUE, 4,
    'Passeio de barco, guia, colete salva-vidas',
    'Cancelamento gratuito até 24h antes. Sujeito a condições climáticas.',
    'Fácil', 'Família'
  )
ON CONFLICT (slug) DO UPDATE SET
  short_description       = EXCLUDED.short_description,
  shared_price_per_person = EXCLUDED.shared_price_per_person,
  is_active               = TRUE;

-- ── 2. Horários dos passeios ──────────────────────────────────────
WITH
  reg   AS (SELECT id FROM regions WHERE slug = 'jericoacoara'),
  buggy AS (SELECT id FROM tours WHERE slug = 'buggy-completo-jericoacoara'),
  sol   AS (SELECT id FROM tours WHERE slug = 'por-do-sol-duna-jericoacoara'),
  lagoa AS (SELECT id FROM tours WHERE slug = 'lagoas-azul-paraiso-jericoacoara'),
  barco AS (SELECT id FROM tours WHERE slug = 'passeio-barco-lagoa-grande-jericoacoara')
INSERT INTO tour_schedules (tour_id, region_id, schedule_name, departure_time, estimated_return_time, active_weekdays, is_active)
SELECT t.tid, (SELECT id FROM reg), t.name, t.dep::TIME, t.ret::TIME, t.days, TRUE
FROM (VALUES
  ((SELECT id FROM buggy), 'Manhã',  '08:00', '16:00', '{0,1,2,3,4,5,6}'::INT[]),
  ((SELECT id FROM sol),   'Tarde',  '16:30', '19:30', '{0,1,2,3,4,5,6}'::INT[]),
  ((SELECT id FROM lagoa), 'Manhã',  '09:00', '13:00', '{0,1,2,3,4,5,6}'::INT[]),
  ((SELECT id FROM lagoa), 'Tarde',  '13:30', '17:30', '{0,1,2,3,4,5,6}'::INT[]),
  ((SELECT id FROM barco), 'Tarde',  '14:00', '17:00', '{1,2,3,4,5,6}'::INT[])
) AS t(tid, name, dep, ret, days);

-- ── 3. Preços por veículo/passeio ─────────────────────────────────
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
  ((SELECT id FROM v_b2),  (SELECT id FROM reg), 'tour', (SELECT id FROM buggy), 'per_vehicle', 350.00, 450.00, TRUE),
  ((SELECT id FROM v_b4),  (SELECT id FROM reg), 'tour', (SELECT id FROM buggy), 'per_vehicle', 500.00, 650.00, TRUE),
  ((SELECT id FROM v_hil), (SELECT id FROM reg), 'tour', (SELECT id FROM buggy), 'per_vehicle', 600.00, 750.00, TRUE),
  -- Pôr do Sol
  ((SELECT id FROM v_b2),  (SELECT id FROM reg), 'tour', (SELECT id FROM sol),   'per_vehicle', 200.00, 250.00, TRUE),
  ((SELECT id FROM v_b4),  (SELECT id FROM reg), 'tour', (SELECT id FROM sol),   'per_vehicle', 280.00, 350.00, TRUE),
  ((SELECT id FROM v_hil), (SELECT id FROM reg), 'tour', (SELECT id FROM sol),   'per_vehicle', 320.00, 400.00, TRUE),
  -- Lagoas
  ((SELECT id FROM v_b2),  (SELECT id FROM reg), 'tour', (SELECT id FROM lagoa), 'per_vehicle', 250.00, 300.00, TRUE),
  ((SELECT id FROM v_b4),  (SELECT id FROM reg), 'tour', (SELECT id FROM lagoa), 'per_vehicle', 360.00, 450.00, TRUE),
  ((SELECT id FROM v_hil), (SELECT id FROM reg), 'tour', (SELECT id FROM lagoa), 'per_vehicle', 420.00, 520.00, TRUE),
  -- Barco
  ((SELECT id FROM v_bar), (SELECT id FROM reg), 'tour', (SELECT id FROM barco), 'per_vehicle',1200.00,1500.00, TRUE);
