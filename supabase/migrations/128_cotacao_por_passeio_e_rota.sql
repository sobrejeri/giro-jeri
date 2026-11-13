-- =============================================================================
-- 128_cotacao_por_passeio_e_rota.sql — PASSEIO e ROTA "sob cotação"
-- =============================================================================
-- Pedido do dono: além dos pacotes com preço (valor fixo), o passeio e a rota
-- de translado podem ficar na vitrine SEM valor, "sob cotação". O cliente toca
-- e cai direto no fluxo de cotação que já existe, com os dados preenchidos:
--
--   • passeio sob cotação → "Montar meu passeio" com as paradas do roteiro já
--     escolhidas (tours.quote_stops) e a ETIQUETA do passeio na cotação
--     (tour_quotes.tour_id) — a cooperativa sabe que o pedido é daquele passeio;
--   • rota sob cotação    → translado personalizado com origem e destino da rota
--     e a etiqueta da rota na cotação (transfer_quotes.route_id).
--
-- Nada muda para o que já existe: tudo nasce DESLIGADO (valor fixo), e a API e
-- os apps funcionam sem esta migração (só não oferecem a opção nova).
-- Idempotente.
-- =============================================================================

-- Passeio: valor fixo (padrão) ou sob cotação, e o roteiro pré-definido.
-- quote_stops: [{ "name": "Árvore da Preguiça", "stop_id": "<uuid da parada>" }]
-- — paradas da lista do admin (tour_stop_options, 127), na ordem do roteiro.
ALTER TABLE tours ADD COLUMN IF NOT EXISTS quote_only  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tours ADD COLUMN IF NOT EXISTS quote_stops JSONB   NOT NULL DEFAULT '[]';

-- Rota de translado: valor fixo (padrão) ou sob cotação. default_price continua
-- NOT NULL (001); numa rota sob cotação ele não é mostrado nem cobrado.
ALTER TABLE transfer_routes ADD COLUMN IF NOT EXISTS quote_only BOOLEAN NOT NULL DEFAULT FALSE;

-- Etiqueta: de qual passeio/rota a cotação nasceu. SET NULL ao apagar o passeio
-- ou a rota — a cotação continua existindo, só perde a etiqueta.
ALTER TABLE tour_quotes     ADD COLUMN IF NOT EXISTS tour_id  UUID REFERENCES tours(id)           ON DELETE SET NULL;
ALTER TABLE transfer_quotes ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES transfer_routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tours_quote_only ON tours (quote_only) WHERE quote_only;
