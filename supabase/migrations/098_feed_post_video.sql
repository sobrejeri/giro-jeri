-- 098 — Vídeo no feed (posts estilo reels)
-- Além da imagem, um post do "Descubra a Vila" pode ter um vídeo. Quando houver
-- vídeo, o app mostra o player; senão, a imagem, como antes.

ALTER TABLE feed_posts
  ADD COLUMN IF NOT EXISTS video_url TEXT;
