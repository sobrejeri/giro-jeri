-- =============================================================================
-- 075_modais_cadastraveis.sql — O modal vira cadastro, não lista fixa
-- =============================================================================
-- As 073/074 criaram o eixo do modal com um CHECK de valores fixos
-- ('terrestre', 'aereo', 'aquatico'). Funciona, mas cada modal novo vira
-- migration + deploy — o dono não consegue criar nada sozinho.
--
-- Aqui o modal deixa de ser lista no código e vira TABELA. `service_modals`
-- guarda os modais, e as três colunas que já existem passam a apontar para ela
-- por chave estrangeira, no lugar do CHECK.
--
-- Por que FK e não continuar com CHECK:
--   • o banco garante que ninguém grave um modal que não existe;
--   • ON UPDATE CASCADE: renomear o slug arruma sozinho quem aponta;
--   • ON DELETE RESTRICT: não dá para apagar um modal em uso — o erro aparece
--     na hora, em vez de deixar veículo órfão apontando para o nada.
--
-- Nada muda de comportamento: os três modais de hoje entram como as primeiras
-- linhas da tabela, com os mesmos slugs.
--
-- Idempotente.
-- =============================================================================

-- ── 1. A tabela ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_modals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE service_modals IS
  'Modais de operação (terrestre, aéreo, aquático, …). O veículo só é oferecido '
  'em serviço do mesmo modal; quem define o modal do serviço é a categoria dele. '
  'Cadastrável pelo admin — antes era um CHECK fixo nas migrations 073/074.';

-- ── 2. Os modais que já existem ─────────────────────────────────────────────
INSERT INTO service_modals (slug, name, description, sort_order) VALUES
  ('terrestre', 'Terrestre', 'Buggy, 4x4, van, jardineira.',        1),
  ('aereo',     'Aéreo',     'Helicóptero e demais aeronaves.',     2),
  ('aquatico',  'Aquático',  'Barco, lancha, catamarã.',            3)
ON CONFLICT (slug) DO NOTHING;

-- Qualquer valor já gravado nas três colunas precisa existir na tabela, senão
-- a FK do passo 4 falha. Cobre banco que tenha sido editado à mão.
INSERT INTO service_modals (slug, name, sort_order)
SELECT DISTINCT m.modal, initcap(replace(m.modal, '-', ' ')), 90
  FROM (
    SELECT modal FROM vehicles   WHERE modal IS NOT NULL
    UNION SELECT modal FROM categories WHERE modal IS NOT NULL
    UNION SELECT modal FROM transfers  WHERE modal IS NOT NULL
  ) m
ON CONFLICT (slug) DO NOTHING;

-- ── 3. Sai o CHECK ──────────────────────────────────────────────────────────
ALTER TABLE vehicles   DROP CONSTRAINT IF EXISTS vehicles_modal_check;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_modal_check;
ALTER TABLE transfers  DROP CONSTRAINT IF EXISTS transfers_modal_check;

-- ── 4. Entra a FK ───────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE vehicles ADD CONSTRAINT vehicles_modal_fkey
    FOREIGN KEY (modal) REFERENCES service_modals(slug)
    ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE categories ADD CONSTRAINT categories_modal_fkey
    FOREIGN KEY (modal) REFERENCES service_modals(slug)
    ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE transfers ADD CONSTRAINT transfers_modal_fkey
    FOREIGN KEY (modal) REFERENCES service_modals(slug)
    ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
-- Leitura pública (o app compara o modal do veículo com o do serviço) e
-- escrita só do admin. A policy de escrita vem JUNTO de propósito: a 034 criou
-- as de catálogo e esqueceu `categories`, e o painel só descobriu isso meses
-- depois, com "new row violates row-level security policy" na cara do dono
-- (corrigido na 072). Tabela nova nasce com as duas.
ALTER TABLE service_modals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_service_modals" ON service_modals;
CREATE POLICY "public_service_modals" ON service_modals FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "admin_write_service_modals" ON service_modals;
CREATE POLICY "admin_write_service_modals" ON service_modals FOR ALL
  USING      (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin'));

CREATE INDEX IF NOT EXISTS idx_service_modals_ativo
  ON service_modals (sort_order) WHERE is_active = TRUE;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Os modais cadastrados:
SELECT slug, name, is_active, sort_order FROM service_modals ORDER BY sort_order, name;

-- Quem usa cada modal (ajuda antes de desativar algum):
SELECT m.slug,
       (SELECT count(*) FROM vehicles   v WHERE v.modal  = m.slug) AS veiculos,
       (SELECT count(*) FROM categories c WHERE c.modal  = m.slug) AS categorias_passeio,
       (SELECT count(*) FROM transfers  t WHERE t.modal  = m.slug) AS categorias_translado
  FROM service_modals m ORDER BY m.sort_order;

-- As três FKs no lugar:
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname LIKE '%_modal_fkey' ORDER BY conname;
*/
