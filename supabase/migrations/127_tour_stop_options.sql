-- =============================================================================
-- 127_tour_stop_options.sql — PARADAS do "Montar meu passeio", definidas pelo admin
-- =============================================================================
-- O cliente escolhe as paradas do passeio personalizado nesta lista, em vez de
-- buscar qualquer lugar no mapa: o admin controla para onde os roteiros vão.
-- Fora dela, o cliente escolhe "Outro destino" e escreve — a cooperativa avalia
-- na cotação (a parada vai em tour_quotes.stops com "outro": true).
--
-- region_ids vazio = a parada aparece em todos os municípios; com municípios,
-- só para quem está neles. A lista nasce com os 17 pontos que o app já sugeria
-- (só o nome: os motoristas conhecem pelo nome, e coordenada inventada põe o
-- pin no lugar errado). A carga inicial só acontece com a tabela vazia — rodar
-- de novo não traz de volta uma parada que o admin apagou.
--
-- Acesso só pela API (service_role) — RLS ligada sem políticas públicas.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tour_stop_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(150) NOT NULL,
  description varchar(300),
  region_ids  uuid[] NOT NULL DEFAULT '{}',
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tour_stop_options_name_chk CHECK (length(btrim(name)) > 0)
);

-- Um nome só (sem diferenciar maiúsculas): "Lagoa Azul" não entra duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tour_stop_options_name
  ON tour_stop_options (lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_tour_stop_options_ativas
  ON tour_stop_options (sort_order) WHERE is_active;

ALTER TABLE tour_stop_options ENABLE ROW LEVEL SECURITY;

-- updated_at automático (mesma função das outras tabelas).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tour_stop_options_updated') THEN
    PERFORM create_updated_at_trigger('tour_stop_options');
  END IF;
END $$;

-- Carga inicial: os pontos que o app já sugeria, na mesma ordem.
INSERT INTO tour_stop_options (name, sort_order)
SELECT v.name, v.ordem
  FROM (VALUES
    ('Pedra Furada', 1),
    ('Duna do Pôr do Sol', 2),
    ('Lagoa do Paraíso', 3),
    ('Buraco Azul (Caiçara)', 4),
    ('Árvore da Preguiça', 5),
    ('Lagoa Azul', 6),
    ('Mangue Seco', 7),
    ('Lagoa de Tatajuba', 8),
    ('Praia da Vila de Jericoacoara', 9),
    ('Praia da Malhada', 10),
    ('Munzuá Pier Club', 11),
    ('Praia do Preá', 12),
    ('Lagun Beach', 13),
    ('Guriú', 14),
    ('Dunas do Amâncio', 15),
    ('Barrinha', 16),
    ('Tatajuba', 17)
  ) AS v(name, ordem)
 WHERE NOT EXISTS (SELECT 1 FROM tour_stop_options);

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
--   SELECT sort_order, name, is_active, region_ids FROM tour_stop_options ORDER BY sort_order;
