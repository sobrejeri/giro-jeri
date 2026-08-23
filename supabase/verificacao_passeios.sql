-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação da tela de Passeios redesenhada
--
-- NÃO É MIGRATION. Não cria nem altera nada — só consulta. Pode rodar quantas
-- vezes quiser, em produção, sem risco.
--
-- Por que existe: o redesenho da tela de Passeios não pediu nenhuma coluna
-- nova. As três que o cartão usa (difficulty_level, max_people,
-- highlight_badge) existem desde a migration 001, e as fotos do "Descubra"
-- moram em system_settings, criadas sozinhas no primeiro envio pelo admin.
-- O que costuma faltar é DADO, não estrutura: o cartão fica sem duração,
-- sem dificuldade e sem capacidade porque os campos estão vazios.
--
-- No fim do arquivo há modelos de preenchimento, comentados.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1) A estrutura está de pé? ───────────────────────────────────────────────
-- Esperado: 3. Se vier menos, a API detecta e devolve a lista de passeios SEM
-- esses campos (em vez de quebrar), mas o cartão fica pobre.
SELECT count(*) AS colunas_do_cartao_ok
FROM information_schema.columns
WHERE table_name = 'tours'
  AND column_name IN ('difficulty_level', 'max_people', 'highlight_badge');


-- ── 2) O que falta em cada passeio ───────────────────────────────────────────
-- Uma linha por passeio ativo. Onde disser "— falta", aquele pedaço do cartão
-- simplesmente não aparece para o cliente.
--
--   dificuldade      → a bolinha verde/laranja ("Fácil", "Moderado")
--   capacidade       → o "12 pessoas" ao lado do preço
--   etiqueta         → a tarja laranja sobre a foto
--   foto             → sem ela o cartão cai num degradê colorido
--   etiquetas_filtro → alimentam as pastilhas (Lagoas, Aventura, Pôr do sol…)
--   preco_privativo  → vem das regras de preço por veículo, não da tabela tours
SELECT
  t.name                                                    AS passeio,
  COALESCE(t.difficulty_level, '— falta')                   AS dificuldade,
  COALESCE(t.max_people::text, '— falta')                   AS capacidade,
  COALESCE(t.highlight_badge, '— falta')                    AS etiqueta,
  CASE WHEN COALESCE(t.cover_image_url, '') = ''
       THEN '— falta' ELSE 'ok' END                         AS foto,
  CASE WHEN COALESCE(cardinality(t.tags), 0) = 0
       THEN '— falta' ELSE array_to_string(t.tags, ', ') END AS etiquetas_filtro,
  COALESCE(
    (SELECT min(r.base_price)::text
       FROM vehicle_pricing_rules r
      WHERE r.service_id = t.id AND r.service_type = 'tour' AND r.is_active),
    '— falta'
  )                                                          AS preco_privativo
FROM tours t
WHERE t.is_active
ORDER BY t.display_order, t.name;


-- ── 3) Imagens configuradas no admin ─────────────────────────────────────────
-- Todas são enviadas em Configurações → Aparência. Nenhuma precisa de SQL:
-- a chave nasce no primeiro envio. Esta consulta só mostra o que já existe.
SELECT v.ord,
       v.k                                                AS chave,
       COALESCE(NULLIF(s.setting_value, ''), '— não enviada') AS valor
FROM (VALUES
  (1, 'home_banner_image_url'),            -- banner da home E faixa dos passeios
  (2, 'descubra_restaurantes_image_url'),
  (3, 'descubra_eventos_image_url'),
  (4, 'descubra_lugares_image_url'),
  (5, 'descubra_dicas_image_url')
) AS v(ord, k)
LEFT JOIN system_settings s ON s.setting_key = v.k
ORDER BY v.ord;


-- ─────────────────────────────────────────────────────────────────────────────
-- MODELOS DE PREENCHIMENTO — descomente e ajuste. Rode um passeio por vez e
-- confira na tela antes de seguir para o próximo.
-- ─────────────────────────────────────────────────────────────────────────────

-- Dificuldade, capacidade e etiqueta de um passeio.
-- difficulty_level aceita texto livre; o app reconhece variações de
-- "fácil/easy", "moderado/medium" e "difícil/hard" (com ou sem acento) e pinta
-- a bolinha de verde, laranja ou vermelho. Qualquer outro valor é exibido como
-- foi escrito, em cinza — não some da tela.
--
-- UPDATE tours SET
--   difficulty_level = 'moderado',
--   max_people       = 12,
--   highlight_badge  = 'Top escolha'
-- WHERE slug = 'litoral-oeste';

-- Etiquetas que viram pastilhas de filtro no topo da tela.
-- ATENÇÃO: sobrescreve as etiquetas atuais do passeio.
--
-- UPDATE tours SET tags = ARRAY['Pôr do sol'] WHERE slug = 'por-do-sol';

-- Acrescentar uma etiqueta sem apagar as existentes:
--
-- UPDATE tours SET tags = array_append(COALESCE(tags, '{}'), 'Lagoas')
-- WHERE slug = 'litoral-leste' AND NOT COALESCE(tags, '{}') @> ARRAY['Lagoas'];
