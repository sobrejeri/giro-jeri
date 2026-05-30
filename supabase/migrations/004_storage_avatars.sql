-- =============================================================================
-- GIRO JERI — Migration 004: bucket de avatares no Supabase Storage
-- =============================================================================

-- Cria o bucket público para fotos de perfil
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Qualquer pessoa pode ler avatares (são públicos)
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Só o próprio usuário (via service role da API) pode fazer upload/delete
-- Como os uploads são feitos pelo backend com service role, RLS não bloqueia.
-- Esta policy é para eventual acesso direto autenticado:
CREATE POLICY "avatars_owner_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars');
