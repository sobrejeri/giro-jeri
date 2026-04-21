-- ═══════════════════════════════════════════════════════════════
-- GIRO JERI — Bucket de Imagens (tour-images)
-- Execute UMA VEZ após criar o projeto Supabase
-- ═══════════════════════════════════════════════════════════════

-- Criar bucket público
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tour-images',
  'tour-images',
  TRUE,
  5242880,                                    -- 5 MB por arquivo
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public             = TRUE,
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif'];

-- Política: qualquer usuário autenticado pode fazer upload
DROP POLICY IF EXISTS "upload_tour_images" ON storage.objects;
CREATE POLICY "upload_tour_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tour-images');

-- Política: leitura pública (sem autenticação)
DROP POLICY IF EXISTS "public_tour_images" ON storage.objects;
CREATE POLICY "public_tour_images" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'tour-images');

-- Política: deletar apenas o próprio upload
DROP POLICY IF EXISTS "delete_own_tour_images" ON storage.objects;
CREATE POLICY "delete_own_tour_images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'tour-images' AND owner = auth.uid());

SELECT 'Bucket tour-images configurado com sucesso.' AS status;
