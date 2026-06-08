-- 017: contato do motorista no despacho (para a Ordem de Serviço / WhatsApp)
-- O nome e o WhatsApp do motorista eram coletados no despacho mas não tinham
-- onde ser persistidos. Estas colunas permitem que a OS em PDF e o envio por
-- WhatsApp tragam o motorista mesmo após recarregar a página.
ALTER TABLE operational_assignments
  ADD COLUMN IF NOT EXISTS driver_name  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(30);
