-- =============================================================================
-- 065_route_cover_image.sql — Foto de capa nas rotas de translado
-- =============================================================================
-- Os passeios já têm `cover_image_url` e aparecem ilustrados no app; as rotas
-- de translado só tinham gradiente + texto. Esta coluna permite ao admin
-- subir uma foto por rota (mesmo fluxo de upload dos passeios).
--
-- Opcional: rota sem foto continua caindo no gradiente, então nada quebra
-- enquanto as imagens não são cadastradas.
-- =============================================================================

ALTER TABLE transfer_routes ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
