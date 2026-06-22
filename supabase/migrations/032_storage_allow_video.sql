-- =============================================================================
-- GIRO JERI — Migration 032: permitir vídeos no bucket "avatars"
--
-- Contexto:
--   O bucket público "avatars" (migration 004) é reutilizado para toda a mídia
--   do site sob o prefixo "site/" (banners, feed, estabelecimentos e agora os
--   itens de Destaques). Ele foi criado restrito a imagens até 2 MB:
--       file_size_limit    = 2097152
--       allowed_mime_types = image/jpeg, image/png, image/webp
--
-- Problema:
--   Qualquer upload de vídeo retornava 400 (Bad Request) no Storage, pois o
--   mime type video/* não está na allowlist e o arquivo passa de 2 MB.
--
-- Correção:
--   Subir o limite para 50 MB e adicionar os mime types de vídeo. As imagens
--   continuam limitadas a 2 MB pela própria lógica da API (resize no cliente +
--   verificação de tamanho no endpoint), então o teto maior só habilita vídeos.
-- =============================================================================

UPDATE storage.buckets
SET
  file_size_limit    = 52428800,  -- 50 MB
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4',  'video/webm', 'video/quicktime', 'video/x-msvideo'
  ]
WHERE id = 'avatars';

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Deve mostrar file_size_limit = 52428800 e os mime types de vídeo na lista:
SELECT id, file_size_limit, allowed_mime_types
  FROM storage.buckets
 WHERE id = 'avatars';
*/
