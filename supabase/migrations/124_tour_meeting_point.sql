-- 124 — Ponto de embarque FIXO do passeio (ex.: heliponto do voo panorâmico).
--
-- Alguns passeios saem de um local definido pelo próprio operador/admin (voo de
-- helicóptero, por exemplo). Nesses casos o cliente NÃO escolhe o "Local de
-- saída": ele já vem definido, aparece pronto no carrinho e vira o pin de
-- localização no WhatsApp — tanto para o TURISTA (onde embarcar) quanto para o
-- motorista. Opcional: passeio sem ponto fixo segue como antes (cliente escolhe).
ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS meeting_point_name VARCHAR(300),
  ADD COLUMN IF NOT EXISTS meeting_latitude   DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS meeting_longitude  DECIMAL(10, 7);

COMMENT ON COLUMN tours.meeting_point_name IS
  'Nome do ponto de embarque fixo (ex.: Heliponto Jericoacoara). Quando definido (com lat/long), substitui o Local de saída escolhido pelo cliente e gera o pin de localização no WhatsApp.';
