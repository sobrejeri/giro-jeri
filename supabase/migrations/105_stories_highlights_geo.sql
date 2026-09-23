-- Localização para stories (avatar_stories, 24h) e destaques (story_highlights),
-- para aparecerem como pin no "Explorar Turiva" — agrupados pela localização.
-- Opcionais: sem lat/lng o story/destaque simplesmente não entra no mapa.

ALTER TABLE avatar_stories   ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE avatar_stories   ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE story_highlights ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE story_highlights ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_avatar_stories_latlng   ON avatar_stories   (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_story_highlights_latlng ON story_highlights (latitude, longitude);
