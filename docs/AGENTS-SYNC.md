# AGENTS-SYNC — coordenação entre agentes

Canal de coordenação entre os agentes (Claude) que trabalham em paralelo neste
repositório. Sessões de agentes são isoladas e **não conseguem conversar
diretamente** — este arquivo, versionado no git, é o quadro compartilhado:
todo agente **lê antes de começar** e **registra ao terminar**, e assim um
enxerga o trabalho do outro no próximo `git fetch`.

## Protocolo

1. **Antes de começar uma atividade**: `git fetch origin claude/giro-jeri-platform-GFBFR`
   e leia este arquivo + `git log --oneline -15` para ver o que o outro agente
   fez/está fazendo.
2. **Ao iniciar algo grande** (nova área, migration, refactor): acrescente uma
   linha em "Em andamento" e faça push junto do primeiro commit.
3. **Ao concluir**: mova a linha para o "Diário", com data e commits.
4. **Migrations**: a numeração em `supabase/migrations/` é o maior risco de
   colisão. Antes de criar uma, confira o último número no branch remoto e
   registre aqui o número reservado. **Próximo número livre: 049.**
5. **Deploy**: tudo (Pages + Render) sai do branch
   `claude/giro-jeri-platform-GFBFR`. Não versionar segredos aqui — nunca.

## Em andamento

| Agente | Área | Desde | Observação |
|---|---|---|---|
| — | — | — | — |

## Diário (mais recente primeiro)

- **2026-07-08 · Agente B (datas unificadas em todas as telas)** — Criado
  `components/DateSheet.jsx` (calendário compartilhado, portalado, com minDate +
  alta temporada). Aplicado em: transfer personalizado (faltava minDate/regra
  4h) e edição do carrinho (era `<input type=date>` nativo — não coloria nem
  bloqueava direito). Regras alinhadas em todo lugar: transfer 4h, passeio
  meio-dia (cutoff), alta temporada em laranja. Transfers passou a usar o
  DateSheet compartilhado (removido o local). ⚠️ A cor de alta temporada só
  aparece após o `/api/seasons` ir pra prod (PR #37).

- **2026-07-08 · Agente B (feed Instagram + publicação admin)** — Descubra: post
  redesenhado estilo Instagram (mídia full-bleed 4:5 com fundo desfocado, sem
  corte; cabeçalho perfil/nome/tag SOBRE a imagem; ações curtir·comentar·
  compartilhar). Selo verificado extraído p/ `components/VerifiedBadge.jsx`
  (usado no feed e nos destaques). Feed API passou a devolver author_avatar/
  author_name (foto do admin autor — precisa deploy). NOVO: **publicação direta
  do admin no Descubra** — `components/FeedPublisher.jsx` (compositor/editor de
  evento/promoção com upload de imagem), botão "Nova publicação" (admin) + editar
  /excluir por post. Usa as rotas admin já existentes (POST/PUT/DELETE /api/feed)
  e `createPost/updatePost/deletePost` no cliente. Home fixada no layout novo.
  Badge do carrinho conta serviços. Transfer: regra de 4h (tela + backend/fuso).

- **2026-07-08 · Agente B (design carrinho universal + mín. R$1)** — Baixou o
  valor mínimo de pagamento de R$5 → R$1 (`payments.js`, precisa merge p/ Render)
  e entregou SQL de passeio de teste a R$1. Escreveu o **desenho da Etapa 3 —
  carrinho universal** (`docs/ETAPA-3-carrinho-pagamento-unico.md`): modelo
  escolhido = **N reservas + 1 pagamento** via `order_group_id`, reusando o
  split do motor de pernas. Reserva a **migration 049** para os `order_group_id`.
  Ainda é só desenho — implementação não começou.

- **2026-07-08 · Agente B (data/calendário + alta temporada)** — Barras de
  resumo agora só aparecem com veículo selecionado. Regra de data: padrão
  meio-dia (Fortaleza) → passou de 12h, só amanhã+ (corrige "sempre Hoje");
  cutoff do serviço tem prioridade. Sheets de data (Tours + Transfers) e
  RouteSheet portalados p/ document.body (estavam presos pelo transform do
  PullToRefresh e abriam fora da tela). NOVO endpoint público **`GET
  /api/seasons`** (`routes/seasons.js` + registrado no index) — lista regras de
  alta temporada ativas; o calendário pinta de laranja os dias de alta
  temporada (helper `lib/season.js`). ⚠️ O endpoint só responde depois de
  merge na main + redeploy do Render; até lá o calendário fica sem cor
  (degrada bem). Arquivos: api `index.js`+`seasons.js`, turista `api.js`,
  `lib/season.js`, `Tours.jsx`, `Transfers.jsx`.

- **2026-07-08 · Agente B (barra de resumo fixa via portal)** — CAUSA RAIZ: a
  barra de resumo (Tours/Transfers) usava `fixed`, mas fica dentro do wrapper do
  `PullToRefresh` (transform/will-change) → o `fixed` era preso na PÁGINA, não no
  viewport, e a barra "sumia no fim do conteúdo" ao rolar. Mesmo bug do
  StoryViewer. Fix: **renderizar as barras via `createPortal(document.body)`** —
  agora coladas no rodapé da tela, sempre visíveis; só o conteúdo (veículos)
  rola. Revertido o chip do carrinho na barra; o `CartFab` voltou a ser o FAB
  solto, posicionado ACIMA da barra (`bottom-[150px]`) em `/passeios` e
  `/transfers`. Arquivos: `Tours.jsx` (barra privativa + compartilhada),
  `Transfers.jsx` (barra rota), `CartFab.jsx`.

- **2026-07-08 · Agente B (carrinho embutido na barra)** — O FAB flutuante
  cobria o conteúdo que rola atrás dele (botão do resumo, +/- de passageiros/
  veículos). Solução: em Passeios/Translados o `CartFab` solto some, e o
  carrinho vira um **chip dentro da barra de resumo** (canto esquerdo, ícone +
  badge, leva a `/carrinho`) — parte do rodapé fixo, nunca sobre conteúdo.
  Chip adicionado às barras principais: Tours (privativo) e Transfers (rota).
  Arquivos: `CartFab.jsx`, `Tours.jsx`, `Transfers.jsx`.

- **2026-07-08 · Agente B (FAB acima do resumo)** — O `CartFab` (carrinho
  flutuante) cobria o botão "Adicionar ao carrinho" do resumo em Passeios/
  Translados. Agora ele sobe para `bottom-[150px]` nessas rotas (`/passeios`,
  `/transfers`), ficando ACIMA do resumo; nas demais telas segue em
  `bottom-[86px]`. Arquivo: `components/CartFab.jsx`.

- **2026-07-08 · Agente B (UX pré-seleção + sugestões no carrinho)** — Refino do
  fluxo de pré-seleção: resumo flutuante SEMPRE visível embaixo (Tours modo
  privativo agora aparece mesmo sem veículo, com prompt); botão renomeado de
  "Continuar" → **"Adicionar ao carrinho"** (Tours + Transfers). Na `CartPage`,
  nova seção **"Complete sua viagem"** (cross-sell): sugere passeios que ainda
  não estão no carrinho (query `getTours`, filtra por id), card leva a
  `/passeios` já pré-selecionando o passeio (`state.selectedId`). Arquivos:
  `Tours.jsx`, `Transfers.jsx`, `CartPage.jsx`. Build OK.

- **2026-07-08 · Agente B (pré-seleção → carrinho)** — Assumi a atividade que o
  **Agente A** estava fazendo quando bateu o limite semanal. ⚠️ O WIP dele
  (+939/-8, visto no chat) **não foi enviado** ao remoto — ficou no container
  dele; a branch `claude/jericoacoara-dynamic-location-ewp8t9` no origin estava
  igual à GFBFR. Então **reimplementei** a pedido do usuário:
  - **Tours (privativo)** e **Transfers (rota definida)**: adicionar veículos
    virou **pré-seleção local** (removido o auto-save no carrinho). O botão
    **"Continuar"** salva a pré-seleção no carrinho (`upsertItem`) e navega para
    `/carrinho`, onde data/hora/saída são refinadas na edição do item.
  - `canContinue`/`canBook` passaram a exigir só capacidade (veículos cobrindo
    as pessoas) — horário/origem deixaram de ser obrigatórios na pré-seleção.
  - Resumo do transfer: removidos "Data & Hora" e o acréscimo de temporada
    (agora calculados no carrinho); mostra "Total dos veículos" + aviso. Botão
    "Confirmar Transfer" → "Continuar". Removida a query de surcharge órfã.
  - Arquivos: `Tours.jsx`, `Transfers.jsx`. Build turista OK.

- **2026-07-08 · Agente A (carrinho/motor de pernas)** — Carrinho estilo ML
  (`/carrinho`): regra de capacidade dos veículos trava o Salvar e o
  "Solicitar tudo"; sugestão automática de veículo + "Adicionar outro
  veículo"; hidratação de capacidade para rascunhos antigos. Antes:
  regras de antecedência (Fortaleza tz), buscador de local, motor de pernas
  ligado em prod, migrations 041–048 aplicadas, autocancel ancorado no
  horário do serviço (service−15min / service−20min).
- **2026-07-08 · Agente B (etapas 2/3 + deploy)** — Revisei a Etapa 2/3 (3
  revisores paralelos) e corrigi por etapas:
  - **Etapa 1:** cutoff no cliente agora usa America/Fortaleza (`Tours.jsx`);
    migration **042** re-executável (DROP TRIGGER IF EXISTS).
  - **Etapa 2 (segurança):** aceite de perna passou a checar roteamento por
    veículo (opt-out) em `operator.js`; `checkout-accepted` restrito ao
    turista dono do pedido/admin.
  - **Etapa 3:** split multi-coop soma exato ao total (centavos, maior resto —
    `allocateCents`); contabilidade por perna idempotente (migration **046**
    índices únicos + upsert); delete de coop re-enfileira pernas (migration
    **045**); **checkout parcial (R3)** backend (`legFlow.js` + migration
    **047**) e tela do turista (`BookingDetail`).
  - Migration **044** (alinha RLS de `booking_legs` a opt-out).
  - **Deploy:** abri e mergeei o **PR #36** (`GFBFR → main`, fast-forward) →
    Render redeployou a API com tudo. `/health` no ar.
  - **Nota p/ Agente A:** você reconciliou meu `legFlow.js` para ancorar o
    prazo no serviço (service−15min) via `cancel_overdue_leg_bookings` (048).
    Com isso, o setting `leg_payment_window_minutes` (047) e a função
    `getLegPaymentWindowMinutes()` ficaram **órfãos** (não são mais usados) —
    dá pra remover numa limpeza futura, sem pressa. Alinhado do meu lado. 👍

## Estado da plataforma (resumo p/ contexto rápido)

- Flag `booking_legs_engine_enabled` = **ON** em produção (plataforma ainda
  sem uso ativo — em desenvolvimento).
- Última migration aplicada em prod: **048** (cancel_overdue_leg_bookings).
  Se PostgREST não enxergar a função: `NOTIFY pgrst, 'reload schema';`
- Carrinho: localStorage `turiva_cart_v1`; item carrega `cap` por veículo
  desde jul/2026 (rascunhos antigos são hidratados na edição).
- Pendências conhecidas: rotacionar SUPABASE_SERVICE_ROLE_KEY (exposta em
  chat — ação do usuário); E2E de pagamento/split em staging.
