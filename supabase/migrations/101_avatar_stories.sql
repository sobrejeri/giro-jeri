-- 101 — Stories efêmeros do perfil (estilo Instagram, expiram em 24h)
-- Diferente dos "destaques" (story_highlights/stories), que são permanentes.
-- Estes ficam no círculo colorido em volta da foto do perfil e somem após 24h.
-- Registram quem visualizou (para o admin ver a lista, como no Instagram).

CREATE TABLE IF NOT EXISTS avatar_stories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  media_url           TEXT NOT NULL,
  media_type          TEXT NOT NULL DEFAULT 'image',   -- 'image' | 'video'
  caption             TEXT,
  duration_sec        INT  NOT NULL DEFAULT 20,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_avatar_stories_active
  ON avatar_stories (expires_at, created_at);

-- Quem viu cada story (1 registro por usuário/story).
CREATE TABLE IF NOT EXISTS avatar_story_views (
  story_id        UUID NOT NULL REFERENCES avatar_stories(id) ON DELETE CASCADE,
  viewer_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_avatar_story_views_story
  ON avatar_story_views (story_id, viewed_at DESC);

ALTER TABLE avatar_stories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_story_views  ENABLE ROW LEVEL SECURITY;
