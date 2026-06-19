-- =============================================================================
-- 021 — Central de notificações (leitura) + assinaturas de Web Push
-- =============================================================================
-- A tabela `notifications` já existia como log de envio. Aqui adicionamos o
-- controle de "lido" para a central dentro do app, e uma tabela para guardar
-- as inscrições de Web Push (notificação real no celular / desktop).
-- Seguro de rodar mais de uma vez (IF NOT EXISTS).

-- ── Leitura das notificações (central no app) ────────────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id) WHERE read_at IS NULL;

-- ── Inscrições de Web Push (Fase 2) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions (user_id);
