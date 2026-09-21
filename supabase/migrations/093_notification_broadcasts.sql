-- 093 — Histórico de envios manuais (broadcasts) de notificação.
-- Registra cada disparo feito no admin: texto, público e quantos usuários.

CREATE TABLE IF NOT EXISTS notification_broadcasts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  audience    TEXT        NOT NULL,
  sent_count  INTEGER     NOT NULL DEFAULT 0,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_broadcasts_created
  ON notification_broadcasts (created_at DESC);

-- Acesso só pela API (service role ignora RLS).
ALTER TABLE notification_broadcasts ENABLE ROW LEVEL SECURITY;
