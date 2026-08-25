-- =============================================================================
-- 073_modal_terrestre_aereo.sql — Frota por modal (terrestre × aéreo)
-- =============================================================================
-- Hoje a frota só sabe responder "serve para passeio?" e "serve para transfer?"
-- (`is_tour_allowed` / `is_transfer_allowed`). Falta o outro eixo: TERRESTRE ou
-- AÉREO. São quatro combinações reais do negócio — passeio terrestre, passeio
-- aéreo, translado terrestre, translado aéreo — e sem o segundo eixo o buggy
-- aparecia num trecho de helicóptero.
--
-- Até agora isso era contornado de dois jeitos frágeis:
--   • `requires_opt_in` (066), que só tira o helicóptero das listas padrão —
--     não impede o contrário (buggy num serviço aéreo);
--   • lembrar de cadastrar a matriz de preços rota a rota. Esquecer uma rota
--     traz o problema de volta, em silêncio.
--
-- O modal fica na CATEGORIA, não em cada serviço: toda rota já tem categoria
-- obrigatória e os voos ficam na categoria deles, então marca-se UMA vez e
-- todas as rotas/passeios daquela categoria herdam.
--
-- Nada é obrigatório para quem já usa: o padrão é 'terrestre', que é o que
-- todo o catálogo é hoje, tirando o helicóptero.
--
-- Idempotente.
-- =============================================================================

-- ── 0. Garantia da 071 ──────────────────────────────────────────────────────
-- O INSERT do passo 3 grava `is_exclusive`, criada na 071. Num banco onde a 071
-- não rodou, a 073 inteira morreria em "column does not exist". Esta base já
-- teve OITO números de migration duplicados e duas rodadas fora de ordem; a
-- garantia custa uma linha e evita a terceira.
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 1. A coluna, nos três lugares ───────────────────────────────────────────
-- TEXT + CHECK em vez de ENUM: acrescentar valor num enum exige migration com
-- ALTER TYPE (e não roda dentro de transação em versões antigas). Com CHECK,
-- incluir 'maritimo' amanhã é um ALTER de constraint.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS modal TEXT NOT NULL DEFAULT 'terrestre';
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS modal TEXT NOT NULL DEFAULT 'terrestre';
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS modal TEXT NOT NULL DEFAULT 'terrestre';

DO $$
BEGIN
  ALTER TABLE vehicles   ADD CONSTRAINT vehicles_modal_check
    CHECK (modal IN ('terrestre', 'aereo'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE categories ADD CONSTRAINT categories_modal_check
    CHECK (modal IN ('terrestre', 'aereo'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE transfers  ADD CONSTRAINT transfers_modal_check
    CHECK (modal IN ('terrestre', 'aereo'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN vehicles.modal IS
  'terrestre | aereo — em que meio o veículo opera. Cruzado com '
  'is_tour_allowed/is_transfer_allowed, dá as quatro combinações do negócio.';
COMMENT ON COLUMN categories.modal IS
  'terrestre | aereo — modal dos PASSEIOS desta categoria. O app só oferece '
  'veículos do mesmo modal.';
COMMENT ON COLUMN transfers.modal IS
  'terrestre | aereo — modal das ROTAS desta categoria de translado.';

-- ── 2. Backfill: só o helicóptero é aéreo hoje ──────────────────────────────
UPDATE vehicles
   SET modal = 'aereo'
 WHERE modal <> 'aereo'
   AND (slug = 'helicoptero-3-pax'
        OR name ILIKE '%helic%'
        OR name ILIKE '%aeronave%'
        OR name ILIKE '%avi_o%');

-- Categoria de translado aéreo (migration 067).
UPDATE transfers
   SET modal = 'aereo'
 WHERE modal <> 'aereo'
   AND (slug = 'translado-aereo-helicoptero' OR name ILIKE '%aére%' OR name ILIKE '%aere%');

-- ── 3. Os voos panorâmicos ganham categoria ─────────────────────────────────
-- Os 11 voos da migration 065 entraram SEM categoria. Sem ela não há de onde
-- tirar o modal, e o passeio aéreo cairia como terrestre — exatamente o defeito
-- que esta migration existe para fechar.
--
-- `is_exclusive = FALSE` de propósito: eles já são `tours.is_exclusive` e
-- aparecem em "Experiências exclusivas". Marcar aqui os moveria para um
-- carrossel próprio — mudança visível que fica à escolha do dono, na tela de
-- Catálogo ("Carrossel próprio no app").
INSERT INTO categories (name, slug, description, category_type, modal, is_active, sort_order, is_exclusive)
VALUES (
  'Voos Panorâmicos',
  'voos-panoramicos',
  'Passeios aéreos de helicóptero.',
  'tour', 'aereo', TRUE, 10, FALSE
)
ON CONFLICT (slug) DO UPDATE SET
  category_type = 'tour',
  modal         = 'aereo',
  is_active     = TRUE;

UPDATE tours t
   SET category_id = c.id
  FROM categories c
 WHERE c.slug = 'voos-panoramicos'
   AND t.slug LIKE 'heli-%'
   AND t.category_id IS DISTINCT FROM c.id;

-- ── 4. Busca da frota por modal ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vehicles_modal_ativo
  ON vehicles (modal, display_order)
  WHERE is_active = TRUE;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Frota por modal (espera o helicóptero sozinho em 'aereo'):
SELECT modal, count(*), string_agg(name, ', ' ORDER BY name) FROM vehicles
 WHERE is_active GROUP BY modal;

-- Categorias aéreas (espera 'Translado Aéreo — Helicóptero' e 'Voos Panorâmicos'):
SELECT 'transfer' AS tipo, name, modal FROM transfers  WHERE modal = 'aereo'
UNION ALL
SELECT 'tour',            name, modal FROM categories WHERE modal = 'aereo';

-- Os 11 voos apontando para a categoria aérea:
SELECT count(*) AS voos_com_categoria
  FROM tours t JOIN categories c ON c.id = t.category_id
 WHERE c.slug = 'voos-panoramicos';
*/
