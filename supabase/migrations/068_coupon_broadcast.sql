-- ─────────────────────────────────────────────────────────────────────────────
-- 068 · Divulgação de cupom por WhatsApp
--
-- Permite que o admin envie uma oferta para os clientes cadastrados e que o
-- cliente "aceite" a oferta (guarda o cupom e usa no checkout).
--
-- Duas coisas que NÃO são opcionais aqui:
--
-- 1. `marketing_opt_out` — envio em massa sem porta de saída é o caminho mais
--    curto para o número da empresa ser bloqueado pelo WhatsApp: quem não quer
--    receber denuncia, e denúncia derruba o número. Além de ser exigência da
--    LGPD para comunicação promocional.
--
-- 2. `coupon_broadcasts` — sem registro do que já foi enviado, um clique a
--    mais reenvia a mesma oferta para todo mundo. Aqui fica o histórico e o
--    andamento de cada disparo.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Porta de saída do cliente ────────────────────────────────────────────────
-- Padrão FALSE (recebe): são clientes que já se cadastraram na plataforma. O
-- descadastro é feito por link na própria mensagem — não por resposta de
-- texto, porque não há webhook de entrada do Z-API neste projeto.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS marketing_opt_out    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketing_opt_out_at TIMESTAMPTZ;

COMMENT ON COLUMN users.marketing_opt_out IS
  'Cliente pediu para não receber ofertas por WhatsApp (link de descadastro na mensagem).';

-- Índice parcial: a consulta de destinatários filtra sempre por quem NÃO optou
-- por sair. O índice cobre exatamente essa fatia.
CREATE INDEX IF NOT EXISTS idx_users_marketing_ok
  ON users (user_type)
  WHERE marketing_opt_out = FALSE AND is_active = TRUE;


-- ── Disparos ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupon_broadcasts (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coupon_id         UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  message           TEXT NOT NULL,
  -- 'running' enquanto envia, 'done' ao terminar, 'failed' se abortou.
  status            VARCHAR(20) NOT NULL DEFAULT 'running',
  total_recipients  INT NOT NULL DEFAULT 0,
  sent_count        INT NOT NULL DEFAULT 0,
  failed_count      INT NOT NULL DEFAULT 0,
  error_text        TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coupon_broadcasts_status_check
    CHECK (status IN ('running', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_coupon_broadcasts_coupon
  ON coupon_broadcasts (coupon_id, created_at DESC);

-- Um disparo em andamento por cupom. Barra o clique duplo no botão e duas abas
-- do admin disparando a mesma oferta ao mesmo tempo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_broadcasts_um_ativo
  ON coupon_broadcasts (coupon_id)
  WHERE status = 'running';


-- ── Quem já recebeu ──────────────────────────────────────────────────────────
-- Uma linha por cliente por cupom. A UNIQUE é o que garante que ninguém receba
-- a mesma oferta duas vezes, mesmo que o disparo seja repetido depois.
CREATE TABLE IF NOT EXISTS coupon_broadcast_recipients (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  broadcast_id UUID NOT NULL REFERENCES coupon_broadcasts(id) ON DELETE CASCADE,
  coupon_id    UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone        VARCHAR(30),
  status       VARCHAR(20) NOT NULL DEFAULT 'sent',
  error_text   TEXT,
  accepted_at  TIMESTAMPTZ,   -- quando o cliente abriu o link e aceitou
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coupon_broadcast_recipients_status_check
    CHECK (status IN ('sent', 'failed')),
  CONSTRAINT coupon_broadcast_recipients_unicos
    UNIQUE (coupon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cbr_broadcast ON coupon_broadcast_recipients (broadcast_id);


-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Só a API (service role) escreve e lê. Nenhuma policy para o cliente: são
-- dados operacionais de campanha, não do usuário.
ALTER TABLE coupon_broadcasts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_broadcast_recipients  ENABLE ROW LEVEL SECURITY;
