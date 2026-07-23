-- =============================================================================
-- GIRO JERI — Migration 030: story_highlights (agrupamento estilo Instagram)
--
-- Objetivo:
--   Introduzir uma hierarquia de dois níveis para a feature de Stories:
--
--     story_highlights  →  "círculos" temáticos na home (ex.: "Passeios", "Praias")
--     stories           →  itens de mídia dentro de cada highlight
--
--   Passos:
--     1. Criar a tabela `story_highlights` (tabela pai / grupos).
--     2. Adicionar coluna `highlight_id` UUID FK em `stories` (tabela filho).
--     3. Criar índices de leitura para ambas as tabelas.
--     4. Habilitar RLS em story_highlights (stories já tem RLS da migration 029).
--
-- Compatibilidade:
--   A migration 029 (tabela `stories`) NÃO foi aplicada em produção ainda.
--   Por isso é seguro alterar a estrutura de `stories` aqui sem migration de rollback.
--
-- Dependências:
--   - Migration 001 define create_updated_at_trigger().
--   - Migration 029 define a tabela `stories`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tabela story_highlights  (grupos / tópicos exibidos como círculos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS story_highlights (
  id                  UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title               VARCHAR(80)  NOT NULL,
  cover_image_url     TEXT,                              -- imagem do círculo na home
  sort_order          INT          NOT NULL DEFAULT 0,
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by_user_id  UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  story_highlights                          IS 'Grupos de destaques (tópicos) exibidos como círculos na home.';
COMMENT ON COLUMN story_highlights.title                   IS 'Rótulo exibido abaixo do círculo (ex.: "Passeios", "Praias").';
COMMENT ON COLUMN story_highlights.cover_image_url         IS 'Imagem de capa do círculo. Se NULL o front usa a primeira mídia do grupo.';
COMMENT ON COLUMN story_highlights.sort_order              IS 'Ordem de exibição dos círculos (crescente). Menor valor = aparece primeiro.';
COMMENT ON COLUMN story_highlights.is_active               IS 'FALSE oculta o highlight inteiro (e seus itens) sem apagá-lo.';
COMMENT ON COLUMN story_highlights.created_by_user_id      IS 'Usuário admin que criou o highlight (auditoria).';


-- -----------------------------------------------------------------------------
-- 2. Trigger de updated_at para story_highlights
--    Reutiliza a função create_updated_at_trigger definida em migration 001.
-- -----------------------------------------------------------------------------
SELECT create_updated_at_trigger('story_highlights');


-- -----------------------------------------------------------------------------
-- 3. Índice de leitura pública em story_highlights
--    Cobre: filtro is_active = TRUE + ordenação por sort_order.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_story_highlights_active_sort
  ON story_highlights (is_active, sort_order);


-- -----------------------------------------------------------------------------
-- 4. RLS em story_highlights
-- -----------------------------------------------------------------------------
ALTER TABLE story_highlights ENABLE ROW LEVEL SECURITY;

-- Leitura pública: apenas highlights ativos
CREATE POLICY "public_highlights"
  ON story_highlights
  FOR SELECT
  USING (is_active = TRUE);

-- Administração irrestrita para admins
CREATE POLICY "admin_highlights"
  ON story_highlights
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM users
       WHERE id = auth.uid()
         AND user_type = 'admin'
    )
  );


-- -----------------------------------------------------------------------------
-- 5. Adicionar FK highlight_id em stories
--    ON DELETE CASCADE: ao apagar um highlight, seus itens são removidos junto.
--    IF NOT EXISTS garante idempotência caso a migration seja reaplicada.
-- -----------------------------------------------------------------------------
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS highlight_id UUID
    REFERENCES story_highlights(id) ON DELETE CASCADE;

COMMENT ON COLUMN stories.highlight_id IS 'FK para o grupo (highlight) ao qual este item pertence.';


-- -----------------------------------------------------------------------------
-- 6. Índice composto em stories para a consulta aninhada principal
--    Cobre: filtro por highlight_id + ordenação por sort_order.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_stories_highlight_sort
  ON stories (highlight_id, sort_order);


-- =============================================================================
-- SCRIPT DE VERIFICAÇÃO
-- Execute após aplicar a migration para confirmar os resultados esperados.
-- =============================================================================

/*
-- 1. Confirmar que a tabela story_highlights foi criada com todas as colunas
--    (espera 8 linhas):
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'story_highlights'
 ORDER BY ordinal_position;

-- 2. Confirmar que o trigger de updated_at foi criado em story_highlights
--    (espera 1 linha):
SELECT trigger_name, event_manipulation, action_timing
  FROM information_schema.triggers
 WHERE event_object_table = 'story_highlights';

-- 3. Confirmar que o índice de leitura foi criado em story_highlights
--    (espera 1 linha):
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'story_highlights'
   AND indexname = 'idx_story_highlights_active_sort';

-- 4. Confirmar que RLS está habilitado em story_highlights
--    (espera rowsecurity = true):
SELECT relname, relrowsecurity
  FROM pg_class
 WHERE relname = 'story_highlights';

-- 5. Confirmar as duas policies de story_highlights
--    (espera 2 linhas: public_highlights e admin_highlights):
SELECT policyname, cmd, qual
  FROM pg_policies
 WHERE tablename = 'story_highlights'
 ORDER BY policyname;

-- 6. Confirmar que a coluna highlight_id foi adicionada em stories
--    (espera 1 linha com data_type = 'uuid'):
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'stories'
   AND column_name = 'highlight_id';

-- 7. Confirmar que o FK highlight_id -> story_highlights está presente
--    (espera 1 linha):
SELECT tc.constraint_name, tc.table_name, kcu.column_name,
       ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage  AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
 WHERE tc.constraint_type = 'FOREIGN KEY'
   AND tc.table_name      = 'stories'
   AND kcu.column_name    = 'highlight_id';

-- 8. Confirmar que o índice composto foi criado em stories
--    (espera 1 linha):
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'stories'
   AND indexname = 'idx_stories_highlight_sort';

-- 9. Smoke test: criar um highlight, adicionar um item e consultar pela relação
--    (espera 1 highlight com 1 story aninhado):
BEGIN;
  INSERT INTO story_highlights (title, sort_order, is_active)
  VALUES ('Passeios Teste', 0, TRUE)
  RETURNING id;

  -- Substitua <highlight_uuid> pelo id retornado acima
  -- INSERT INTO stories (display_name, media_url, media_type, highlight_id, sort_order)
  -- VALUES ('Item Teste', 'https://cdn.exemplo.com/test.jpg', 'image', '<highlight_uuid>', 0);

  -- SELECT h.title, s.display_name, s.media_url
  --   FROM story_highlights h
  --   JOIN stories s ON s.highlight_id = h.id
  --  WHERE h.is_active = TRUE;
ROLLBACK;
*/
