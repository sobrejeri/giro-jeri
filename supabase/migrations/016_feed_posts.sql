-- =============================================================================
-- GIRO JERI — Migration 016: feed de eventos da vila
-- =============================================================================
-- Posts (estilo feed do Instagram) com eventos que vão acontecer em Jericoacoara.
-- Gerenciado pelo admin; leitura pública no app do turista.
-- As imagens reaproveitam o bucket público "avatars" (prefixo "site/").
-- =============================================================================

CREATE TABLE IF NOT EXISTS feed_posts (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title              VARCHAR(200) NOT NULL,
  body               TEXT,
  image_url          TEXT,
  event_date         DATE,
  event_time         VARCHAR(30),
  location           VARCHAR(200),
  is_published       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ordenação/visibilidade do feed
CREATE INDEX IF NOT EXISTS idx_feed_posts_published ON feed_posts (is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_posts_event     ON feed_posts (event_date);

COMMENT ON TABLE feed_posts IS 'Feed de eventos/novidades da vila exibido no app do turista';
