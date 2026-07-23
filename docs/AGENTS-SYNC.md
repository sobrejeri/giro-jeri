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
   registre aqui o número reservado. **Próximo número livre: 064.**
5. **Deploy**: tudo (Pages + Render) sai do branch
   `claude/giro-jeri-platform-GFBFR`. Não versionar segredos aqui — nunca.

## Em andamento

| Agente | Área | Desde | Observação |
|---|---|---|---|
| — | — | — | — |

## Diário (mais recente primeiro)

- **2026-07-23 · Agente B (Etapa 4 #1 — 2FA por WhatsApp, opcional)** — Verificação
  em duas etapas OPCIONAL por conta. **migration 063** (`063_mfa.sql`): coluna
  `users.mfa_enabled` (default false) + tabela `mfa_challenges` (sessão pendente:
  guarda o `refresh_token` do Supabase entre a senha validada e o código, com RLS
  ligada e sem policies → só o backend acessa; vida 10 min, consumo único).
  **API**: `lib/mfaToken.js` (JWT HS256 `purpose:'mfa'`, 10 min, carrega só
  challenge_id+user_id — nenhum segredo de sessão). No `/login`, após validar a
  senha e passar o gate de verificação, se `mfa_enabled` + telefone +
  `isWhatsappEnabled()`: envia OTP (reaproveita `requestOtp`/`otp_codes` da 023),
  cria o desafio guardando o `refresh_token` e responde `{status:'mfa_required',
  mfa_token, channel, destination}` (NÃO devolve a sessão). Novos endpoints
  `POST /auth/mfa/verify` (confere o código via `verifyOtp`, marca o desafio
  consumido, reidrata a sessão com `refreshSession` do token guardado e devolve
  token/refresh/user) e `POST /auth/mfa/resend`. `PATCH /me` aceita `mfa_enabled`
  (exige telefone p/ ligar); `GET /me` devolve a flag; ambos toleram 42703
  (migration pendente). **Fail-open** deliberado: se o canal WhatsApp não estiver
  configurado ou o envio falhar, o login segue sem 2º fator (não tranca ninguém
  fora num ambiente sem Z-API). **Turista**: Auth.jsx ganha o passo `VerifyMfa`
  (tela de código no login) e trata `mfa_required`; Profile/ProfileDesktop ganham
  o card `MfaToggle` (switch liga/desliga imediato, exige telefone). api.js:
  `mfaVerify`, `mfaResend`. Build turista ok. **Rodar no Supabase: migration 063.**

- **2026-07-18 · Agente B (carrinho = solicitação única atômica)** — Com o motor
  de pernas OFF, um pedido do carrinho passa a ser UMA solicitação atômica para a
  coop: aceita TODOS os serviços de uma vez (tudo-ou-nada), sem aceite por item,
  sem parcial, sem parte pega por outra coop. Backend: novo
  `POST /api/operator/bookings/group/:groupId/accept` (um único UPDATE atribui
  todas as reservas awaiting_acceptance do grupo à coop; guard 409 se outra coop
  já pegou parte). Cooperativa: `handleAcceptCombo` chama `acceptGroup` (não mais
  loop item-a-item), removido o botão "Aceitar" por item do ComboCard, rótulos
  "Combo"→"Pedido" e "Aceitar todos"→"Aceitar pedido". api.js coop: `acceptGroup`.

- **2026-07-16 · Agente B (i18n completo do app turista)** — Tradução real
  pt/en/es. Antes só o seletor mudava `i18n.language`; as telas tinham texto
  fixo. Primeira leva manual: TopNav + Perfil (desktop/mobile) + WhatsappCheck.
  Segunda leva via **workflow orquestrado** (17 agentes frontend-expert, um por
  grupo de arquivos): cada agente externalizou as strings do(s) seu(s)
  arquivo(s) com `t('<ns>.<chave>')` e devolveu as chaves pt/en/es; o merge nos
  3 JSONs foi feito no processo principal (sem corrida de escrita). Cobertura:
  Home/HomeDesktop, Tours/ToursDesktop, TourDetail, Transfers/TransfersDesktop,
  Feed, CartPage, Checkout (Summary/Solicitado), BookingDetail, Affiliate,
  Avaliacoes, Legal, Login/AffiliateLink/PartnerLink e componentes
  (Region/Origin picker, PhoneInput, NotificationBell, Feed/StoryPublisher,
  Install/UpdatePrompt). Namespaces novos por tela: `homePg`, `toursPg`,
  `transfersPg`, `checkoutPg`, etc. **1138 chaves idênticas nos 3 idiomas**
  (paridade total, sem fallback); build ok. Ainda em pt fixo: telas já
  parcialmente traduzidas antes (Bookings, Auth) podem ter sobras pontuais.

- **2026-07-15 · Agente B (reputação no app da cooperativa)** — Complemento
  das avaliações: a coop agora vê a própria reputação. API:
  `GET /api/operator/reviews` (autenticado, `operator_id = req.user.id`) →
  `{ summary: {rating_average, rating_count, distribution 1..5}, reviews[] }`
  com autor + nome do serviço; tolerante à 060 ausente (42703 → vazio).
  Front (cooperativa): nova página `/reputacao` (nota grande + barras de
  distribuição + comentários), item "Reputação" na Sidebar, e faixa-resumo
  clicável no Dashboard (aparece só com ≥1 avaliação). api.js: `getReviews`.

- **2026-07-15 · Agente B (avaliações REAIS por cooperativa)** — Substituí os
  depoimentos fake da home por avaliações verificadas. **Migration 060**
  (`060_coop_reviews.sql`): adiciona `reviews.operator_id` (coop que executou,
  desnormalizado da reserva), backfill, índices e policy `reviews_public_read`
  (leitura pública das `is_public`). Backend: `routes/reviews.js` (`GET /` com
  filtros operator_id/service_type/min_rating, `GET /summary` reputação por
  coop, `GET /mine` reservas já avaliadas, `POST /` só p/ reserva PAGA e
  realizada — 1 por reserva, recalcula média do passeio, notifica a coop);
  registrado em `index.js`. `GET /operator/partners` agora devolve
  `rating_average`/`rating_count`. Front (turista): `HomeDesktop` puxa reviews
  reais (some se vazio), nova página `/avaliacoes` (filtro por coop + nota
  mínima), chips de parceiras na `Home` mostram estrela e linkam p/ avaliações,
  `Bookings` ganha botão "Avaliar" (reserva concluída, some se já avaliada) +
  `ReviewSheet` (estrelas + comentário). api.js: `getCoopReviews`,
  `getCoopReviewsSummary`, `getMyCoopReviews`, `createCoopReview`.
  ⚠️ Exige rodar a **migration 060** no Supabase.

- **2026-07-12 · Agente A (ativação do cadastro por código no WhatsApp)** —
  Pedido do usuário: conta só ativa com código de 6 dígitos no WhatsApp.
  Reaproveitei o wizard OTP dormente (signup_token/otp.js) INVERTENDO o canal:
  com `SIGNUP_REQUIRE_VERIFICATION=true`, WhatsApp vira OBRIGATÓRIO no
  cadastro, o e-mail nasce confirmado (não é gate) e o código vai pro
  WhatsApp; `allDone` = phone_verified; gate do login reescrito (contas
  antigas sem phone_e164 NÃO são travadas). Front (Auth.jsx): nova tela
  VerifyWhatsapp (código 6 dígitos, reenvio c/ cooldown, auto-login pós
  ativação); login 403 verification_required reabre o wizard; api.js expõe
  err.payload/status + otpRequest/otpVerify; hint do campo atualizado
  (pt/en/es). Flag OFF = comportamento atual intacto. ⚠️ Ligar exige
  migration 023 + envio WhatsApp ok (checklist 0.6).

- **2026-07-12 · Agente A (auditoria turista + cooperativa)** — Extensão da
  auditoria aos outros 2 apps: chamadas × rotas (turista 73, coop 41 — tudo
  casa) e varredura de crash: turista 14 páginas (logado/deslogado) e
  cooperativa 9 páginas — **zero erro**. StoryPublisher do turista confere
  com o guard novo (UI só admin, rota exige admin). Hardening:
  `/affiliate/activate` com rate-limit (authLimiter); `Register.jsx` legado
  removido (era órfão — o cadastro real é o `Auth.jsx`). Checklist atualizado.

- **2026-07-12 · Agente A (auditoria do admin + checklist de lançamento)** —
  Auditoria completa do admin: (1) cruzamento das 84 chamadas do cliente ×
  rotas da API — único descasamento era `getTour` morto (removido);
  (2) **SEGURANÇA: stories.js tinha POST/PUT/DELETE de destaques/itens SEM
  auth** → agora exigem `authenticate, requireAdmin` (leitura pública intacta);
  varredura nos demais routers: só ficam públicos login/OTP/webhook/
  calculadoras (ok); (3) as 16 páginas do admin abertas no navegador com
  mocks — zero crash; modais principais (passeio/cupom/usuário/temporada/
  região) abrem sem erro. Criado **docs/CHECKLIST-LANCAMENTO.md** — mapa
  único de teste/pendências por área com roteiro até agosto (Agente B: usar
  e atualizar este arquivo).

- **2026-07-12 · Agente A (DDI internacional no telefone)** — Novo
  `components/PhoneInput.jsx`: dropdown de código do país com bandeira emoji
  (derivada do ISO, sem imagens), nome em pt via `Intl.DisplayNames`, busca
  por nome/código, ~190 países (Brasil fixo no topo). Valor entra/sai como
  string única "+DDI número" — backend intacto; parse de valores salvos casa
  o DDI mais longo. Ligado no telefone do Perfil (edição) e no WhatsApp do
  cadastro (`Auth.jsx`); removida a trava antiga de "+55" fixo (Auth e
  Register legado). ⚠️ B: se mexer no Perfil de novo, o campo de telefone
  agora é o componente.

- **2026-07-12 · Agente B (CAUSA RAIZ dos "sumiços" intermitentes + fix)** —
  Os episódios de "dados sumindo" que saravam sozinhos (lista de usuários só
  com o admin + '4 no Auth sem perfil', login CNPJ 'não encontrado', INSERT
  barrado por RLS, /health alternando rls_bypass true/false) NÃO eram chave
  errada no Render nem RLS mal configurado: `auth.js` chamava
  `signInWithPassword`/`refreshSession` no client GLOBAL service_role — o
  supabase-js guarda a sessão do usuário EM MEMÓRIA nesse client e todas as
  queries seguintes passam a rodar como aquele usuário (authenticated+RLS) até
  o próximo deploy limpar. O `refreshSession` (renovação automática dos apps)
  re-envenenava o tempo todo. FIX: `freshAuthClient()` descartável para o
  handshake de auth (3 call sites); client global nunca mais carrega sessão.
  Guarda extra já ativa: boot recusa chave anon/publishable; `/health` expõe
  `supabase_key` + `rls_bypass` (teste real). DESCOBERTA operacional: o Render
  agora deploya DIRETO do branch (commit do branch rodando em prod sem merge) —
  o protocolo item 5 está correto; merges p/ main viraram opcionais.

- **2026-07-12 · Agente A (chave PIX do afiliado — migration 056)** — O turista
  cadastra a chave PIX no painel do afiliado (card "Chave PIX para receber":
  tipo CPF/celular/e-mail/aleatória + validação leve; alerta âmbar quando há
  comissão pendente sem chave) e ela aparece direto para o admin na tela
  Afiliados (chave copiável em verde + tipo; sem chave → aviso âmbar com
  contato de fallback; confirm do "Marcar pago" mostra a chave). Migration
  **056** (`users.affiliate_pix_key` + `affiliate_pix_key_type`). API:
  `PUT /affiliate/pix`, `/me` devolve a chave, `GET /admin/commissions` inclui
  — tudo com fallback 42703 enquanto a 056 não roda. ⚠️ Rodar 056 no Supabase.

- **2026-07-12 · Agente A (painel do afiliado no perfil do turista)** — Menu
  "Divulgou, Ganhou · Afiliado" no Perfil → `/afiliado`, que virou um painel
  estilo dashboard (referência visual do usuário): hero laranja "Comissões em
  15 dias" com chips dos 2 meses anteriores, tiles Indicações/A receber/Ticket
  médio e gráfico "Comissões diárias" (SVG puro, série única na cor da marca,
  rótulo no pico, tooltip por toque, grade recessiva — sem lib de gráfico).
  Tudo derivado no cliente do extrato do `/affiliate/me`; hero de marketing só
  aparece antes da ativação. Arquivos: `Profile.jsx`, `Affiliate.jsx`.

- **2026-07-12 · Agente A (taxa de comissão editável + cupons ponta a ponta)** —
  (1) Admin ajusta a % dos afiliados na página Afiliados (upsert em
  `system_settings.affiliate_commission_percent`); `/affiliate/me` devolve
  `percent` e o app do turista mostra a taxa vigente (banner da Home ficou
  genérico). (2) Cupons validados de ponta a ponta — o motor (`applyCoupon`)
  já validava, mas o fluxo novo descartava: `computeChargedTotal` agora devolve
  `{total, couponId, discountAmount}`; `/request` e `/cart-request` gravam
  `coupon_id`/`discount_amount` na reserva e registram `coupon_redemptions`
  (limites passam a contar); cupom funciona também em transfer tabelado;
  novo `POST /payments/validate-coupon` (feedback no app). Turista: campo
  "Cupom de desconto" no Resumo (linha de desconto no total) e no Carrinho
  (valida por tipo elegível, envia o código só nos itens que valem; cupom de
  VALOR FIXO desconta uma vez — percentual vale em cada item elegível).
  Caller `/intent` ajustado (`.total`). Sem migration nova (coupons é do 001).

- **2026-07-12 · Agente A (afiliados — ajustes do usuário)** — Prazo do repasse
  virou **7 dias corridos** (era úteis) em todos os textos + `payout_due_date`.
  Reforço anti-autoindicação no CLIENTE: abrir o **próprio** link `/a/<código>`
  não grava atribuição e mostra aviso ("vale para amigos, não para você") —
  o servidor já travava; agora a UX também. Corrigido o contador de migrations
  deste arquivo: a **055 já é do programa de afiliados** → próxima livre é 056.

- **2026-07-12 · Agente A (programa de afiliados "DIVULGOU, GANHOU")** — Retomei
  o desenho que o Agente B fez no chat antes do limite. Migration **055**
  (`users.affiliate_code` único; índices; unique `(booking_id, affiliate_id)`
  p/ idempotência; setting `affiliate_commission_percent` = 5). API:
  `routes/affiliate.js` (resolve público /a/<código>, activate 1 toque, me);
  `/payments/request` e `/cart-request` aceitam `affiliate_code` (servidor
  resolve, **anti-autoindicação**, grava `affiliate_id` + source_channel
  `affiliate_link`); comissão nasce em `onPaymentApproved` (única e de grupo)
  via `recordAffiliateCommission` — 5% do total pago, `payout_due_date` =
  +7 dias ÚTEIS, INSERT com 23505 engolido (idempotente), notificação ao
  afiliado. Admin: `GET /admin/commissions` (join manual users — affiliate_id
  não tem FK) e `PUT /admin/commissions/:id/pay` (repasse manual via PIX →
  notifica). Turista: `lib/affiliate.js` (atribuição 30 dias), rota `/a/:code`,
  banner "DIVULGOU, GANHOU" na Home, página `/afiliado` (ativar, link+WhatsApp,
  comissões, redirect login via `<Navigate>`); `CartPage` e `CheckoutSummary`
  enviam `affiliate_code`. Admin UI: página **Afiliados** (filtro, contato p/
  PIX, marcar pago). Builds turista/admin OK; fluxo testado no navegador.
  ⚠️ Rodar **migration 055** no Supabase antes de usar. Convive com o
  partner_slug (indicação ≠ venda direta; podem coexistir na mesma reserva).

- **2026-07-10 · Agente B (link de vendas direto por cooperativa — migration 054)**
  — Cada coop ganha `users.partner_slug` (único; backfill p/ operadores ativos).
  Novo `GET /api/partner/:slug` (público, só nome/foto). `/payments/request` e
  `/cart-request` aceitam `partner_slug` (NUNCA operator_id cru): o servidor
  resolve o slug e a(s) reserva(s) nascem **atribuídas** (`operator_id` +
  `awaiting_payment` + `assigned` — mesmo estado do aceite), **sem fila** e sem
  notificar as demais coops; só a dona do link é avisada. Turista: rota
  `/c/:slug` (grava atribuição 7 dias em localStorage), selo verde "Reservando
  com X" no Layout (X remove), Resumo → se nascer awaiting_payment vai DIRETO
  pro pagamento; carrinho envia partner_slug (grupo inteiro atribuído).
  Cooperativa: card "Meu link de vendas" no Perfil (copiar + WhatsApp);
  `GET /operator/profile` devolve partner_slug (⚠️ exige migration 054 ANTES do
  deploy da API — senão o Perfil da coop quebra com 42703). BÔNUS: split de
  pagamento de GRUPO com motor OFF agora reconhece grupo 100% de uma coop
  (combo aceito/venda direta) e sela na conta dela — antes caía na plataforma.
  Próx. migration livre: **055**.

- **2026-07-10 · Agente B (revisão completa de RLS — migration 053)** — Após o
  incidente do "sumiço silencioso" das regras de alta temporada (RLS ligado sem
  política de SELECT → leitura pública voltava []), revisão completa:
  **RLS ligado em TODAS as tabelas** (deny-by-default). Conteúdo público
  (seasons/holidays/feed_posts/establishments/comments/likes/est_reviews) ganhou
  política de SELECT explícita; sensíveis (system_settings ⚠️ chaves PIX,
  payment_events, financial_ledger, commissions, coupons, vehicle_pricing_rules
  etc.) ficam SEM política — só a API (service_role) enxerga. `req.supabase`
  (papel authenticated) só toca tabelas já cobertas por 001/029/030/033/034 —
  nada quebra. Fatos apurados: o cliente global da API bypassa RLS (bookings/
  payments RLS'd desde 001 e as gravações funcionam), e o [] persistente do
  /api/seasons era **cache do Safari** + regras inativas no banco. Guarda de
  boot: conferir no log do Render `[supabase] chave carregada: role=…` =
  service_role/sb_secret. Próx. migration livre: **054**.

- **2026-07-09 · Agente B (passeios: tradicionais vs exclusivos)** — Novo campo
  `tours.is_exclusive` (migration **051**). **Tradicional** (padrão): carrinho/
  combo, 1 pagamento, aceito como **reserva inteira por 1 cooperativa**.
  **Exclusivo**: venda direta, 1 por vez, **sem carrinho** — o card leva direto
  a `/passeios/:id` (TourDetail → Resumo da reserva). Turista `Tours.jsx`: dois
  carrosseis ("Passeios tradicionais" + "Passeios exclusivos"). Admin: toggle
  "Passeio exclusivo" no catálogo. Backend: `catalog.js` grava, `tours.js`
  devolve o campo. **Decisão (1a): motor de pernas fica DESLIGADO** — reserva
  inteira, 1 coop (o fluxo legado já existe; a cooperativa já entende itens
  `kind:'booking'`). ⚠️ Rodar no Supabase: migration 051 **e**
  `UPDATE system_settings SET setting_value='false' WHERE setting_key='booking_legs_engine_enabled';`
  \+ limpar pernas de teste. Próx. migration livre: **052**.

- **2026-07-09 · Agente B (carrinho universal — Fatia B: pagamento único · BACKEND)**
  — ⚠️ **NÃO DEPLOYADO** (muda fluxo de dinheiro; aguarda OK + validação com
  R$1). `POST /payments/intent` passou a aceitar **`order_group_id`**: soma os
  totais das reservas do grupo (aguardando pagamento, todas as pernas aceitas se
  motor ON) e gera **1 pagamento** com `payments.order_group_id` (âncora =
  1ª reserva, pois `payments.booking_id` é NOT NULL). Split de grupo
  (`getSplitContextForGroup`) resolve só **recebedor único** (1 coop) ou sem
  split; **multi-coop → 422** (Opção 2, seguro). `onPaymentApproved` delega para
  novo **`onGroupPaymentApproved`** quando há `order_group_id` — marca TODAS as
  reservas do grupo pagas, lança receita por reserva (rateando a taxa de gateway
  pelo total de cada uma, gate `ledger_created`), contabilidade por perna +
  notificações por reserva. **Caminho de reserva única intacto** (early-return).
  Bloco de notificação extraído p/ `notifyBookingPaid()`. Todos os callers de
  aprovação (in-request cartão, polling, webhook, simulate, manual-confirm)
  propagam `order_group_id` (corrigido o SELECT do polling). Expiração de PIX
  também virou ciente de grupo. **Falta:** frontend "Pagar tudo" + teste real.

- **2026-07-09 · Agente B (carrinho universal — Fatia A: fundação)** — Início da
  Etapa 3 (N reservas, 1 pagamento). Migration **050** (`order_group_id` em
  `bookings` e `payments` + índices parciais — ⚠️ rodar no Supabase). Novo
  endpoint **`POST /api/payments/cart-request`**: recebe o array de itens,
  valida TODOS (antecedência/cutoff/total autoritativo) antes de inserir
  qualquer um (atômico "tudo-ou-nada") e cria N reservas com o mesmo
  `order_group_id`. Frontend: "Solicitar tudo" passa a fazer **1 chamada** (era
  laço por item) — `api.cartRequest`. **NÃO** mexe no pagamento ainda: cada
  reserva continua pagável individualmente (fluxo atual) — Fatia A é
  não-quebrante. **Fatia B (a fazer):** `intent`/`checkout-accepted` de grupo,
  webhook marcando todas paid, botão "Pagar tudo" + parcial. Próx. migration
  livre: **051**. Doc: `docs/ETAPA-3-carrinho-pagamento-unico.md` (o `049`
  citado lá virou `050`).

- **2026-07-09 · Agente B (antecedência mínima POR SERVIÇO)** — Antecedência
  mínima deixou de ser só global e passou a ser **configurável por serviço no
  catálogo** (pedido do usuário). Migration **049** (`min_advance_hours INT` em
  `tours` e `transfers`, aditivo/idempotente — ⚠️ precisa rodar no Supabase).
  Backend: `validateTransferAdvance(date, time, { serviceId })` busca a regra do
  transfer pai (via `transfer_routes → transfers.min_advance_hours`) e só cai no
  setting global `transfer_min_advance_hours` (4h) quando NULL; ligado em
  `payments.js` (/request) e `calculateTabbedTransfer`. `catalog.js` grava o
  campo (tours POST/PUT + TRANSFER_COLS) e o GET /transfers voltou a devolver
  cutoff/advance/etc (antes só id,name,is_active → edição não carregava). Tours/
  transfers turista já devolvem o campo. Admin: campo **"Antecedência mínima
  (horas)"** nos forms de passeio e transfer (`Catalogo.jsx`). Turista: Tours
  (`cutoffMinDate` considera advance), Transfers (rota usa
  `matched.transfers.min_advance_hours`; personalizado usa padrão 4h — separado
  em `customMin*`), CartPage (`lead` por serviço). **Bug pré-existente
  corrigido:** em Transfers.jsx `customAdvanceOk` referenciava `minBookable`
  antes da declaração (TDZ) — movido p/ depois. **Próxima migration livre: 050.**

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

- Flag `booking_legs_engine_enabled` = **OFF** (decisão de produto 2026-07-10:
  reserva INTEIRA aceita por 1 cooperativa, sem divisão por pernas; passeios
  exclusivos = venda direta). O motor de pernas continua no código, atrás da
  flag, caso volte a ser necessário.
- Última migration aplicada em prod: **048** (cancel_overdue_leg_bookings).
  Se PostgREST não enxergar a função: `NOTIFY pgrst, 'reload schema';`
- Carrinho: localStorage `turiva_cart_v1`; item carrega `cap` por veículo
  desde jul/2026 (rascunhos antigos são hidratados na edição).
- Pendências conhecidas: rotacionar SUPABASE_SERVICE_ROLE_KEY (exposta em
  chat — ação do usuário); E2E de pagamento/split em staging.
