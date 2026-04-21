-- ═══════════════════════════════════════════════════════════════
-- GIRO JERI — Diagnóstico do Banco
-- Rode quando quiser ver o estado geral de todas as tabelas
-- ═══════════════════════════════════════════════════════════════

-- ── Contagem por tabela ───────────────────────────────────────────
SELECT
  'DADOS BASE' AS grupo, '── região ──'  AS tabela, NULL::BIGINT AS total
UNION ALL SELECT '', 'regions',              COUNT(*) FROM regions
UNION ALL SELECT '', 'categories',           COUNT(*) FROM categories
UNION ALL SELECT '', 'system_settings',      COUNT(*) FROM system_settings
UNION ALL SELECT '', 'high_season_rules',    COUNT(*) FROM high_season_rules

UNION ALL SELECT 'CATÁLOGO', '── tours ──', NULL
UNION ALL SELECT '', 'tours (ativo)',        COUNT(*) FROM tours      WHERE is_active
UNION ALL SELECT '', 'tours (inativo)',      COUNT(*) FROM tours      WHERE NOT is_active
UNION ALL SELECT '', 'tour_schedules',       COUNT(*) FROM tour_schedules
UNION ALL SELECT '', 'vehicle_pricing_rules',COUNT(*) FROM vehicle_pricing_rules

UNION ALL SELECT 'VEÍCULOS/TRANSFER', '── frota ──', NULL
UNION ALL SELECT '', 'vehicles',             COUNT(*) FROM vehicles
UNION ALL SELECT '', 'transfers',            COUNT(*) FROM transfers
UNION ALL SELECT '', 'transfer_routes',      COUNT(*) FROM transfer_routes

UNION ALL SELECT 'USUÁRIOS', '── usuários ──', NULL
UNION ALL SELECT '', 'users (admin)',         COUNT(*) FROM users WHERE user_type = 'admin'
UNION ALL SELECT '', 'users (operator)',      COUNT(*) FROM users WHERE user_type = 'operator'
UNION ALL SELECT '', 'users (tourist)',       COUNT(*) FROM users WHERE user_type = 'tourist'

UNION ALL SELECT 'TRANSACIONAL', '── reservas ──', NULL
UNION ALL SELECT '', 'bookings',             COUNT(*) FROM bookings
UNION ALL SELECT '', 'payments',             COUNT(*) FROM payments
UNION ALL SELECT '', 'transfer_quotes',      COUNT(*) FROM transfer_quotes
UNION ALL SELECT '', 'reviews',              COUNT(*) FROM reviews

ORDER BY grupo, tabela;

-- ── Passeios cadastrados ──────────────────────────────────────────
SELECT
  t.name,
  c.name          AS categoria,
  t.shared_price_per_person AS preco_compartilhado,
  t.is_featured,
  t.is_active,
  CASE WHEN t.cover_image_url IS NOT NULL THEN '✓ imagem' ELSE '✗ sem imagem' END AS imagem
FROM tours t
LEFT JOIN categories c ON c.id = t.category_id
ORDER BY t.display_order;

-- ── Usuários admin e operator ─────────────────────────────────────
SELECT
  email, full_name, user_type, is_active,
  CASE WHEN auth_id IS NOT NULL THEN '✓ auth vinculado' ELSE '✗ sem auth' END AS auth
FROM users
WHERE user_type IN ('admin', 'operator')
ORDER BY user_type, email;
