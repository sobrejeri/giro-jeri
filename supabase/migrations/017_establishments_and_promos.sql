-- =============================================================================
-- GIRO JERI — Migration 017: ecossistema "Descubra a Vila"
-- =============================================================================
-- 1. Diretório de estabelecimentos (pousadas/hotéis, restaurantes/bares, lojas)
--    com nível "Destaque" (anúncio patrocinado no topo).
-- 2. Feed de eventos passa a suportar também PROMOÇÕES (kind = 'promo').
-- Imagens reaproveitam o bucket público "avatars" (prefixo "site/").
-- =============================================================================

-- ── 1. Estabelecimentos ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS establishments (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name               VARCHAR(200) NOT NULL,
  category           VARCHAR(40)  NOT NULL DEFAULT 'gastronomia', -- hospedagem | gastronomia | compras
  description        TEXT,
  image_url          TEXT,
  whatsapp           VARCHAR(30),
  instagram          VARCHAR(120),
  maps_url           TEXT,
  address            VARCHAR(300),
  price_range        VARCHAR(10),   -- '$', '$$', '$$$'
  is_featured        BOOLEAN NOT NULL DEFAULT FALSE,  -- anúncio em destaque
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order         INT NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_establishments_listing
  ON establishments (is_active, category, is_featured DESC, sort_order);

COMMENT ON TABLE establishments IS 'Diretório de estabelecimentos da vila (guia Descubra a Vila)';

-- ── 2. Promoções no feed ─────────────────────────────────────────────────────
ALTER TABLE feed_posts
  ADD COLUMN IF NOT EXISTS kind           VARCHAR(20) NOT NULL DEFAULT 'event', -- event | promo
  ADD COLUMN IF NOT EXISTS discount_label VARCHAR(60),  -- ex: '20% OFF', '2x1'
  ADD COLUMN IF NOT EXISTS valid_until    DATE;         -- validade da promoção

COMMENT ON COLUMN feed_posts.kind IS 'Tipo do post do feed: event (evento) ou promo (promoção)';
