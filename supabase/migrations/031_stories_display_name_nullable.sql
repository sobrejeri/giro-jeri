-- =============================================================================
-- GIRO JERI — Migration 031: display_name de stories passa a ser opcional
--
-- Contexto:
--   No modelo original (029) cada story tinha display_name NOT NULL — era o
--   rótulo exibido abaixo do círculo. No modelo de Destaques (030) o rótulo do
--   círculo passou a ser o título do highlight; o display_name do item virou
--   apenas uma legenda opcional ("Legenda" no admin).
--
-- Problema:
--   Salvar um item sem legenda enviava display_name = NULL e violava a
--   restrição NOT NULL → erro 500 "null value in column display_name".
--
-- Correção:
--   Tornar display_name nullable.
-- =============================================================================

ALTER TABLE stories
  ALTER COLUMN display_name DROP NOT NULL;

COMMENT ON COLUMN stories.display_name
  IS 'Legenda opcional do item (exibida no topo do viewer). NULL = sem legenda.';

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Deve retornar is_nullable = 'YES':
SELECT column_name, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'stories'
   AND column_name = 'display_name';
*/
