-- 019_engagement.sql
-- Curtidas em posts, comentários em posts, avaliações em estabelecimentos.
-- Idempotente: seguro para re-executar.

-- ── Post Likes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_likes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id    UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id);

-- ── Post Comments ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_comments (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id    UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);

-- ── Establishment Reviews ─────────────────────────────
CREATE TABLE IF NOT EXISTS establishment_reviews (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment          TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(establishment_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_est_reviews_est ON establishment_reviews(establishment_id);
