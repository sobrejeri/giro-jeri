-- ── Reversão da 089 ────────────────────────────────────────────────────────
--
-- Dois níveis. Quase sempre o nível 1 basta.
--
-- Testado em Postgres real (pglite): os dois níveis rodam sem perder linha.

-- ── Nível 1: desfazer só a MARCAÇÃO (reversível, sem downtime) ──────────────
-- Use quando algo foi marcado por engano e o catálogo ficou errado. A coluna
-- continua existindo; tudo volta a ser tratado como transporte, que é o
-- comportamento anterior à migration.
UPDATE vehicles SET is_transport = TRUE WHERE is_transport = FALSE;

-- Confira: tem de voltar zero.
SELECT COUNT(*) AS ainda_marcados FROM vehicles WHERE is_transport = FALSE;


-- ── Nível 2: remover a COLUNA (raro) ───────────────────────────────────────
-- Só se a migration precisar sair inteira. A API já tolera a ausência da
-- coluna: `routes/tours.js` e `routes/transfers.js` tratam o erro 42703 e
-- repetem a consulta sem ela, e no front `ehTransporte()` testa
-- `is_transport !== false` — undefined vira transporte. Ou seja, remover a
-- coluna devolve exatamente o comportamento de antes, sem quebrar tela.
--
-- DROP INDEX IF EXISTS idx_vehicles_transport;
-- ALTER TABLE vehicles DROP COLUMN IF EXISTS is_transport;
