-- =============================================================================
-- GIRO JERI — Migration 029: stories (Instagram-Stories feature)
--
-- Objetivo:
--   Criar a tabela `stories` para suportar a funcionalidade de Stories
--   estilo Instagram na plataforma Giro Jeri / Zarpe.
--
--   Cada story tem:
--     - display_name  : rótulo exibido abaixo do círculo de avatar
--     - avatar_url    : imagem do círculo (opcional; front usa media_url como fallback)
--     - media_url     : URL da mídia principal (imagem ou vídeo)
--     - media_type    : 'image' | 'video' (CHECK constraint)
--     - duration_sec  : segundos antes do avanço automático (padrão 20 s)
--     - is_active     : visibilidade imediata sem apagar o registro
--     - sort_order    : ordem de exibição (menor = primeiro)
--     - expires_at    : expiração opcional — story some automaticamente após este instante
--     - created_by_user_id : FK nullable para users (auditoria; SET NULL ao deletar user)
--
-- RLS:
--   - SELECT público: apenas stories ativos e não expirados.
--   - ALL admin: qualquer operação para usuários com user_type = 'admin'.
--
-- Performance:
--   - Índice composto (is_active, sort_order) cobre a consulta pública principal.
--   - expires_at sem índice dedicado por ora; volume esperado baixo.
--     Se crescer, adicionar: CREATE INDEX ON stories (expires_at) WHERE expires_at IS NOT NULL;
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tabela stories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stories (
  id                  UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name        VARCHAR(80)  NOT NULL,
  avatar_url          TEXT,
  media_url           TEXT         NOT NULL,
  media_type          VARCHAR(10)  NOT NULL DEFAULT 'image'
                        CHECK (media_type IN ('image', 'video')),
  duration_sec        SMALLINT     NOT NULL DEFAULT 20,
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order          INT          NOT NULL DEFAULT 0,
  expires_at          TIMESTAMPTZ,
  created_by_user_id  UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  stories                     IS 'Stories estilo Instagram exibidos na home do turista.';
COMMENT ON COLUMN stories.display_name        IS 'Rótulo exibido abaixo do círculo de avatar.';
COMMENT ON COLUMN stories.avatar_url          IS 'Imagem do círculo. Se NULL o front usa media_url como fallback.';
COMMENT ON COLUMN stories.media_url           IS 'URL da imagem ou vídeo principal do story.';
COMMENT ON COLUMN stories.media_type          IS 'Tipo de mídia: image ou video.';
COMMENT ON COLUMN stories.duration_sec        IS 'Segundos antes do avanço automático para o próximo story.';
COMMENT ON COLUMN stories.is_active           IS 'FALSE oculta o story sem apagá-lo.';
COMMENT ON COLUMN stories.sort_order          IS 'Ordem de exibição (crescente). Menor valor = aparece primeiro.';
COMMENT ON COLUMN stories.expires_at          IS 'Story é ocultado automaticamente após este instante (opcional).';
COMMENT ON COLUMN stories.created_by_user_id  IS 'Usuário admin que criou o story (auditoria).';


-- -----------------------------------------------------------------------------
-- 2. Índice de leitura pública
--    Cobre o filtro (is_active = TRUE) + ordenação (sort_order ASC).
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_stories_active_sort
  ON stories (is_active, sort_order);


-- -----------------------------------------------------------------------------
-- 3. Trigger de updated_at (função definida em migration 001)
-- -----------------------------------------------------------------------------
SELECT create_updated_at_trigger('stories');


-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- Leitura pública: story ativo e não expirado
CREATE POLICY "public_stories"
  ON stories
  FOR SELECT
  USING (
    is_active = TRUE
    AND (expires_at IS NULL OR expires_at > now())
  );

-- Administração irrestrita para admins
CREATE POLICY "admin_stories"
  ON stories
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM users
       WHERE id = auth.uid()
         AND user_type = 'admin'
    )
  );


-- =============================================================================
-- SCRIPT DE VERIFICAÇÃO
-- Execute após aplicar a migration para confirmar os resultados esperados.
-- =============================================================================

/*
-- 1. Confirmar que a tabela foi criada com todas as colunas esperadas
--    (espera 11 linhas):
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'stories'
 ORDER BY ordinal_position;

-- 2. Confirmar que o CHECK constraint de media_type existe
--    (espera 1 linha com constraint_type = 'CHECK'):
SELECT constraint_name, constraint_type
  FROM information_schema.table_constraints
 WHERE table_name = 'stories'
   AND constraint_type = 'CHECK';

-- 3. Confirmar que o índice de leitura foi criado
--    (espera 1 linha):
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'stories'
   AND indexname = 'idx_stories_active_sort';

-- 4. Confirmar que o trigger de updated_at foi criado
--    (espera 1 linha):
SELECT trigger_name, event_manipulation, action_timing
  FROM information_schema.triggers
 WHERE event_object_table = 'stories';

-- 5. Confirmar que RLS está habilitado
--    (espera rowsecurity = true):
SELECT relname, relrowsecurity
  FROM pg_class
 WHERE relname = 'stories';

-- 6. Confirmar as duas policies
--    (espera 2 linhas: public_stories e admin_stories):
SELECT policyname, cmd, qual
  FROM pg_policies
 WHERE tablename = 'stories'
 ORDER BY policyname;

-- 7. Smoke test: inserir um story ativo e consultar pela policy pública
--    (espera 1 linha retornada pelo SELECT):
BEGIN;
  INSERT INTO stories (display_name, media_url, media_type, is_active, sort_order)
  VALUES ('Teste Story', 'https://cdn.exemplo.com/test.jpg', 'image', TRUE, 0);

  SELECT id, display_name, is_active, expires_at
    FROM stories
   WHERE is_active = TRUE
     AND (expires_at IS NULL OR expires_at > now());
ROLLBACK;
*/
