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
   registre aqui o número reservado. **Próximo número livre: 068.**
5. **Deploy**: tudo (Pages + Render) sai do branch
   `claude/giro-jeri-platform-GFBFR`. Não versionar segredos aqui — nunca.

## Em andamento

| Agente | Área | Desde | Observação |
|---|---|---|---|
| — | — | — | — |

## Diário (mais recente primeiro)

- **2026-08-23 · Agente B (revisão da tela de Passeios — 8 correções)** — Feita
  a pedido do dono, procurando falha e não estilo. O que apareceu:
  1. **`GET /api/tours` podia cair inteiro.** As colunas de apresentação
     (`difficulty_level`, `max_people`, `highlight_badge`) estavam no caminho
     duro do SELECT: se alguma faltasse no banco, a consulta que sustenta a
     HOME e a tela de Passeios devolveria 500. Agora tolera `42703` e repete
     sem elas (mesmo padrão de `payments.js`); o front já esconde cada campo
     ausente.
  2. **Seção contradizendo a si mesma:** com a pastilha "Exclusivos", os
     favoritos anunciavam "Nenhum passeio encontrado" logo acima de uma
     fileira de passeios. A seção vazia agora some quando há exclusivos.
  3. **Pastilha invisível:** etiqueta vinda dos atalhos da home podia casar
     por NOME e não existir em `tags` — a lista saía filtrada sem nenhuma
     pastilha marcada. Agora ela é inserida na lista.
  4. **Faixa com altura travada** cortava nome de região longo ("Jijoca de
     Jericoacoara"); virou `min-h` + duas linhas.
  5. **Capacidade sumindo:** com preço largo ("Sob consulta", "R$ 1.200") o
     "12 pessoas" virava "12 pes…". Agora desce de linha (`flex-wrap`).
  6. **Dificuldade crua** (valor não reconhecido, exibido como veio) podia ser
     uma frase e empurrar a duração para fora — ganhou `truncate`.
  7. **Acessibilidade do cartão:** era `role="button"` com um botão
     (favoritar) ANINHADO — inválido — e o leitor de tela anunciava
     "Aventura Favoritar Extremo Leste 8h Moderado…" como nome do botão. O
     papel de botão passou para o NOME do passeio; o cartão continua clicável.
  8. **Contêiner das barras flutuantes engolia toques:** `fixed` de largura
     total e transparente, com z-40, bloqueava cliques na área vazia (pegava
     o alternador). Ganhou `pointer-events-none`, com o cartão de dentro em
     `pointer-events-auto`.
  Também: espaço extra no fim da página enquanto os alternadores existem (o
  botão flutuante cobria o rodapé) — nos DOIS, home e passeios.
  Verificado com cenários hostis (colunas ausentes, região de nome longo,
  dificuldade desconhecida, passeio sem foto/preço/descrição, só exclusivos,
  catálogo vazio) medindo corte de texto por `scrollWidth`×`clientWidth`, mais
  12 verificações de fluxo. Zero erro de JS, zero corte, zero rolagem lateral.

- **2026-08-23 · Agente B (alternador da tela de Passeios + correção do fixed)**
  — O desenho anterior de Passeios voltou ao repositório e as duas versões
  convivem, como já acontecia na home: `Tours.jsx` (anterior), `ToursV2.jsx`
  (novo) e `ToursSwitcher.jsx` decidindo qual renderizar. **O padrão aqui é
  'nova'** — ao contrário da home, cujo padrão é 'atual': o redesenho foi
  pedido e já é o que todo mundo vê; o botão existe para VOLTAR.
  O motor da troca saiu para `lib/versaoTela.js` (`criarVersaoTela`), usado
  pelo `homeVersion.js` e pelo novo `toursVersion.js` — antes era código solto
  só da home, e duplicar em duas telas garantiria divergência. Ganhou try/catch
  no localStorage: com duas telas dependendo dele, uma exceção em navegação
  privada derrubaria a navegação inteira.
  **Defeito corrigido nos dois alternadores:** o botão usava `position: fixed`
  dentro do wrapper do `PullToRefresh`, que aplica `transform` — e transform
  quebra o fixed dos filhos. O botão ficava preso à PÁGINA e descia com a
  rolagem (medido: y=1034 numa janela de 932). Agora vai por portal para o
  `document.body`, a mesma solução que a barra do carrinho já usava. Também
  saiu o `aria-label` dos dois: ele substituía o nome acessível pelo texto do
  atributo, e o leitor de tela anunciava algo diferente do rótulo visível.
  Conferido: padrão novo, reverter, persistir ao recarregar, voltar ao novo,
  `?passeios=atual`, e o botão sem cobrir a barra do carrinho.
  **Quando a decisão sair:** apagar a perdedora, o `ToursSwitcher.jsx` e o
  `lib/toursVersion.js`. `lib/versaoTela.js` só sai quando as DUAS avaliações
  (home e passeios) terminarem.

- **2026-08-23 · Agente B (redesign da tela de Passeios)** — Só UI/UX: nenhuma
  regra de negócio foi tocada. Modo privativo/compartilhado, saída, data,
  pessoas, favoritos, carrinho, sugestão de veículo, cutoff/antecedência,
  venda direta de exclusivo e as barras flutuantes continuam idênticos.
  **Componentes novos** em `components/tours/`: `SegmentedControl`,
  `FilterChip`, `SectionHeader`, `TourCard`, `PromoBanner`, `BenefitsStrip`.
  O `TourPickCard` interno saiu (substituído pelo `TourCard`).
  **API:** o SELECT da lista de passeios passou a trazer `difficulty_level`,
  `max_people` e `highlight_badge` — colunas que já existiam desde a 001 e que
  ninguém expunha. Só isso; nenhuma migration.
  **De onde vem cada dado da tela nova** (nada é fixo no código): preço do
  cartão = `shared_price_per_person` no compartilhado, senão `from_price` (o
  menor preço de veículo, calculado na API) e, sem os dois, "sob consulta" —
  nunca zero, que o cliente leria como grátis. Capacidade = `max_people`.
  Etiqueta = `highlight_badge` → exclusivo/destaque → 1ª tag. Foto do banner =
  `home_banner_image_url` do admin → capa de um passeio em destaque da região;
  sem nenhuma, o banner NÃO é renderizado.
  **Pastilhas de filtro** são derivadas das tags que os passeios realmente
  têm, nunca de lista fixa (pastilha fixa vira botão morto quando o admin
  renomeia uma etiqueta). "Mais vendidos"/"Exclusivos" só entram se houver
  passeio marcado. A pastilha já nasce alinhada ao atalho vindo da home.
  `difficulty_level` é texto livre e foi preenchido à mão (inglês, português,
  com e sem acento): o casamento é por prefixo normalizado e o que não casar é
  exibido como veio, em cinza — dado do admin não some da tela.
  Conferido em 430×932 nos estados: privativo, compartilhado, sem/com passeio
  selecionado, catálogo de veículos, carrinho com item (barra flutuante),
  filtro por pastilha, passeio sem foto/preço/duração e lista vazia.

- **2026-08-23 · Agente B (fundo de areia no app do turista)** — O fundo branco
  saiu. Agora o corpo do app é um tom de areia (`#F4EDE4`) com duas camadas
  quase invisíveis: um grão fino (feTurbulence em SVG) e três manchas quentes
  que sugerem duna. Tudo em CSS/SVG — **nenhum arquivo de imagem**.
  **Onde mexer:** a cor está em `tailwind.config.js` (`fundo.DEFAULT`,
  `fundo.moldura`, `fundo.linha`) e a textura em `src/index.css`. Antes cada
  tela escolhia o seu fundo — havia **quatro** tons diferentes (`#F8F8F8`,
  `#EBEBEB`, `#F7F8FA`, `gray-50`) espalhados por 18 arquivos; todos foram
  removidos e as telas ficaram **transparentes**, então quem pintar um fundo
  opaco numa tela nova tapa a textura sem perceber.
  **Detalhes que não são gosto, são causa:** a textura vive num `body::before`
  *fixo* em vez de ir no `background` do body com `background-attachment:
  fixed` — no Safari do iPhone isso repinta o fundo a cada quadro de rolagem e
  a lista treme. E o `z-index: -1` só funciona porque nada acima pinta por
  cima; é o mesmo motivo de as telas terem ficado transparentes.
  Quem liga "mais contraste" no sistema recebe só a cor lisa, um pouco mais
  clara (o grão reduz a separação entre texto e fundo).
  Conferido em 430×932 e em 1280 (home, passeios e desktop).
  **Segunda passada:** faltavam Reservas, Perfil, Descubra e Legal — usavam
  `min-h-full` e a varredura anterior só pegou `min-h-screen`. Junto, duas
  coisas que o fundo cinza escondia: no Descubra a fileira de filtros tinha
  faixa branca (virava listra atravessando a areia) e os links de rodapé do
  Perfil eram `gray-300/400` (quase apagados). `Login.jsx` NÃO foi tocado —
  não é importado em lugar nenhum, é código morto. Admin e cooperativa ficam
  como estão, por decisão do dono.

- **2026-08-19 · Agente B (home nova em avaliação — turista)** — O dono mandou
  um mockup da tela principal e pediu para testar **com as duas versões
  selecionáveis**, para decidir depois. Nada foi substituído: `HomeSwitcher.jsx`
  renderiza `Home` (atual) ou `HomeV2` (proposta) e um botão flutuante alterna
  na hora; a escolha fica no `localStorage` (`turiva_home_versao`) e também
  aceita `?home=nova|atual` na URL, para mandar o link já na versão certa. As
  duas usam **as mesmas consultas** — com dado falso a comparação não valeria.
  O estado mora em `lib/homeVersion.js` (`useSyncExternalStore`) porque o
  **menu inferior** também reage: na proposta são 5 itens em vez de 6
  ("Descubra" sai do menu e vira uma grade dentro da home).
  Ajustes da revisão do dono já aplicados na V2: topo ~35% mais baixo; preço,
  nota e duração no cartão; carrossel com 1 cartão inteiro + ~20% do próximo
  (82% + scroll-snap); ofertas subiram para antes dos destaques; "Saindo de:"
  em destaque; tracking da marca reduzido (com espaçamento largo lia-se
  "TURVA"). Depois, na passada de enxugamento: as **duas** fileiras de atalho
  viraram **uma** fileira de chips (havia sete botões para ~cinco intenções, e
  "Para hoje"/"Passeio hoje" eram o mesmo clique). Os atalhos de etiqueta
  passaram a filtrar de verdade — `Tours.jsx` ignorava `state.tag` e abria a
  lista inteira; agora casa por tags, nome ou descrição curta e **cai de volta
  na lista completa quando nada casa**, para o atalho nunca levar a tela vazia.
  Depois o dono mandou o mockup fechado e a tela foi reproduzida peça a peça
  (topo em duas linhas, região em pastilha, sol riscado, duna/coqueiro nos
  cartões, os quatro atalhos quadrados de volta, nº de avaliações no cartão,
  ofertas depois do carrossel, menu com risco no item ativo). Conferido com
  captura renderizada em 430×932 — foi assim que apareceram quatro defeitos que
  o código não denunciava (nome do passeio cortado, "Mais vendid…", a silhueta
  passando por trás do título e a linha de apoio quebrando em duas).
  **Fotos do "Descubra":** as quatro saem de `system_settings`
  (`descubra_{restaurantes,eventos,lugares,dicas}_image_url`), enviadas em
  Configurações → Aparência pelo mesmo `POST /api/admin/site-image` do banner.
  Não precisa de migration: o PUT de settings é upsert por `setting_key`. Sem
  foto o quadro fica no degradê — e **de propósito não existe caminho fixo em
  `public/`**, senão quem nunca enviasse imagem pagaria quatro 404 por abertura.
  **Pendências desta tela:** (1) o dono ainda não escolheu a vencedora — quando
  escolher, apagar a perdedora, o `HomeSwitcher.jsx` e o `lib/homeVersion.js`
  (o `BottomNav` volta a ter lista fixa); (2) os quatro quadros de "Descubra"
  apontam **todos** para `/eventos` — Restaurantes/Lugares/Dicas seriam telas
  novas, ainda não existem.

- **2026-08-16 · Agente B (aviso de atualização + rótulos de status)** — Fechado
  e testado pelo usuário. **(a) Atualização:** os três apps agora só AVISAM que
  saiu versão nova (removida a recarga automática — trocava a versão sem ninguém
  perceber e podia apagar formulário em preenchimento). O aviso sai UMA vez por
  versão e some ao clicar em "Atualizar", sem depender do X. O botão navega com
  `?v=<buildId>` — `location.reload()` NÃO serve, o GitHub Pages devolve o mesmo
  index.html do cache e o aviso ficava preso (foi a causa real de várias voltas
  em falso no envio da OS: o navegador chamava `/os-pdf`, já removido). A coop
  usa o MESMO componente do admin/turista; não aparece na página pública
  `/os/:token` (lá quem lê é o passageiro). **(b) Status em inglês:**
  `awaiting_acceptance` entrou no enum por migration posterior e ninguém
  atualizou o mapa do Badge — a tela mostrava a chave crua ao lado de "Pago".
  Corrigido em admin e cooperativa ('Ag. Aceite', com estilo em cada paleta) e o
  fallback deixou de imprimir a chave: humaniza o snake_case. Conferido por
  script contra os 5 enums do schema — nenhum status sem rótulo em português.

- **2026-08-16 · Agente B (OS por LINK + auto-atualização do painel)** — A OS
  passou a ser entregue como **link público**, não como anexo PDF.
  **Caminho até aqui (vale para não repetir):** tentamos anexar o PDF em base64
  (app -> API -> Z-API). Falhou em sequência por três motivos DIFERENTES, e o
  diagnóstico só andou quando cada erro passou a aparecer NA TELA: (1) o
  despacho travava porque o `fetch` do logo não tinha timeout; (2) "request
  entity too large" — o logo era embutido em resolução original (perfil aceita
  2 MB) num desenho de 22mm; (3) o que parecia erro novo era **pacote antigo no
  navegador** chamando endpoint já removido. A mensagem "PDF 0,03 MB" no botão
  provou que (2) já estava resolvido.
  **Desenho final** (ideia do usuário): `lib/osToken.js` (HMAC, purpose
  'os_view', 180 dias — a corrida pode ser daqui a meses; não usa o id da
  reserva na URL porque a OS traz nome/telefone do cliente) + `routes/os.js`
  (`GET /api/os/:token`, PÚBLICO — passageiro e motorista não têm conta; devolve
  só o que a OS exibe) + página pública `/os/:token` no app da coop (fora do
  PrivateRoute) que renderiza a OS e gera o PDF NO APARELHO de quem abre,
  reusando `orderPDF.js` — nada de arquivo trafegando. `notifyDispatchOS` inclui
  o link nas duas mensagens; botão "Enviar OS no WhatsApp" reenvia via
  `/operational/:id/os-link` (substituiu `/os-pdf`).
  **`UpdateGate` (components/) — importante:** o `vite.config` da coop já emitia
  `version.json`, mas ninguém consultava. Agora compara o buildId a cada 45s (e
  ao focar a aba) e **RECARREGA sozinho**, com trava anti-loop. Diferente do
  turista (que só sugere) porque na coop o pacote velho não é tela desatualizada
  — é operação chamando endpoint inexistente. Foi a causa real de várias voltas.
  Também: logo reduzido para 256px/JPEG antes de entrar no PDF, teto de ~3 MB
  que refaz sem logo, limite de corpo da API 5mb -> 8mb.
  CONFIRMADO PELO USUÁRIO: funcionando.

- **2026-07-25 · Agente B (PDF da OS no WhatsApp ao despachar)** — Ao clicar em
  "Despachar", o cliente e o motorista passam a receber a **Ordem de Serviço em
  PDF** anexada, além das mensagens de texto que já existiam.
  Decisão de design: o PDF é gerado no APP DA COOPERATIVA
  (`packages/cooperativa/src/lib/orderPDF.js`, jsPDF, que já existia e alimenta
  os botões Baixar/Compartilhar) e vai em base64 no corpo do despacho. Assim o
  documento enviado é EXATAMENTE o mesmo que a coop vê — sem duplicar 518 linhas
  de layout no servidor nem adicionar stack de PDF na API.
  - `orderPDF.js`: novo `orderPDFBase64()` (usa `output('datauristring')` e corta
    o prefixo). Falha ao gerar devolve null — o despacho nunca é bloqueado.
  - `Despacho.jsx`: `handleSubmit` virou async, gera o PDF e manda em
    `os_pdf_base64` junto do assign.
  - `admin.js` `/operational/:id/assign`: lê `os_pdf_base64` e repassa.
  - `whatsapp.js`: novo `sendDocument()` (Z-API `/send-document/pdf`, aceita URL
    ou data URI) e `notifyDispatchOS` ganhou `pdfBase64` — envia o anexo ao
    cliente e ao motorista depois do texto. Best-effort: erro só é logado.
  Testado: PDF gerado com dados reais = 15 KB, assinatura `%PDF-` válida (cabe
  folgado no limite de 5mb do express). Build da cooperativa ok. NÃO foi possível
  testar contra o Z-API real (o proxy do sandbox bloqueia).

- **2026-07-25 · Agente B (frota opt-in + nome do serviço na coop)** — Três
  correções vindas de teste real com os voos de helicóptero.
  **(1) Solicitação de helicóptero ia para TODAS as cooperativas.** O filtro de
  frota era opt-out (aparecia para todos, menos quem desativou) e, pior, reserva
  COMPARTILHADA não gera `booking_vehicles` — caía no fail-open e escapava do
  filtro. **migration 066**: `vehicles.requires_opt_in` (true no helicóptero) —
  veículo restrito só aparece para quem tem preferência EXPLÍCITA is_active=true;
  os demais seguem opt-out, sem mudança. `services/fleet.js` reescrito com
  helpers compartilhados (`requiredVehiclesByBooking`, `optInVehicleIds`,
  `vehiclePrefs`, `operatorServesVehicles`) usados TANTO pelo feed da coop
  (operator.js) quanto pelas notificações — antes eram duas lógicas separadas.
  Veículos exigidos passam a ser resolvidos por `booking_vehicles` e, quando não
  houver, pelas regras de preço do serviço; a 066 também cria a regra do voo 01
  (compartilhado, sem regra própria) só para DECLARAR qual veículo o executa.
  **(2) A coop aceitava às cegas**: o feed mandava `service_id` mas nunca o NOME
  do serviço — a tela mostrava só "Passeio · Privativo". Novo `attachServiceNames`
  (tours + transfer_routes, com fallback origem→destino) e o nome agora aparece
  como título nos cards de solicitação e de "minhas corridas". Tela renomeada de
  **Corridas → Solicitações** (menu, header e título).
  **(3) Modo errado na venda**: `Tours.jsx` abria SEMPRE em 'private' e o toggle
  nunca consultava `is_private_enabled`/`is_shared_enabled` — dava para comprar
  como privativo um serviço que só existe compartilhado (foi o que aconteceu no
  voo panorâmico). Agora o modo é alinhado ao que o passeio aceita ao abri-lo.
  Validado: 7/7 casos da regra de elegibilidade, migrations 065+066 rodadas em
  Postgres 16 real (idempotentes), builds turista e cooperativa ok.

- **2026-07-24 · Agente B (catálogo: voos de helicóptero Frisonfly como exclusivos)**
  — `065_heli_frisonfly_exclusivos.sql`: os 11 voos panorâmicos da tabela
  @jerivoospanoramicos entram como passeios `is_exclusive = true` (venda direta,
  fora do carrinho — migration 051). Modelo de preço: o **01** é o único
  COMPARTILHADO (R$ 500 **por pessoa** → `tours.shared_price_per_person`); os
  **02–11** são PRIVATIVOS 3 pax e o preço vem de `vehicle_pricing_rules`
  (veículo × passeio), por isso a migration cria o veículo `helicoptero-3-pax`
  (seat_capacity 3) + 1 regra por voo. `vehicle_type='other'` + `category='Helicóptero'`
  DE PROPÓSITO: `ALTER TYPE ... ADD VALUE` não pode ser usado na mesma transação
  em que é criado e quebraria o script no editor SQL do Supabase.
  `duration_hours` = duração TOTAL (nos voos com pouso inclui a parada em terra;
  o tempo de voo fica no nome/descrição). `min_advance_hours = 24`.
  **Autossuficiente**: como descobrimos que a 023 nunca rodou neste banco, o
  script começa com `ADD COLUMN IF NOT EXISTS` para region_ids (028),
  min_advance_hours (049) e is_exclusive (051) — não assume que rodaram.
  **VALIDADA CONTRA POSTGRES REAL** (16, schema 001 carregado): roda limpa,
  os 11 preços conferem com a tabela do parceiro, e é idempotente (2ª execução
  mantém 11 passeios / 1 veículo / 10 regras).
  PENDENTE: os 6 translados aéreos (JJD, Camocim, Sobral, Parnaíba, Fortaleza,
  Teresina) NÃO foram cadastrados — o valor de Sobral na tabela (R$ 97.600) está
  fora do padrão dos demais e precisa de confirmação do dono.

- **2026-07-24 · Agente B (revisão adversarial das Etapas 4–5 + correções)** — Revisão
  com 8 lentes independentes e verificação adversarial (38 achados; 10 confirmados,
  5 refutados, 23 sem verificar por limite de cota). Corrigido:
  **(1) CRÍTICO — takeover de conta.** `lib/resetToken.js` e `lib/signupToken.js`
  assinavam com `SIGNUP_TOKEN_SECRET || '<string publicada no repo>'`. Como a env
  não é obrigatória para a API subir, um ambiente sem ela assinava com segredo
  público → dava para FORJAR o token e trocar a senha de qualquer `user_id` via
  `POST /auth/reset-password`. Novo `lib/tokenSecret.js`: usa a env se tiver 32+
  chars, senão DERIVA por HMAC de `SUPABASE_SERVICE_ROLE_KEY` (obrigatória no boot,
  nunca versionada), com chave separada por propósito (signup ≠ pwd_reset); sem
  base, LANÇA — nunca cai em segredo público. Testado: token forjado com o segredo
  antigo é rejeitado, e signup_token não vale como token de reset.
  **(2) CRÍTICO — gate de verificação era no-op.** `PROFILE_COLS` não inclui
  `phone_e164`, então `profile.phone_e164` era sempre `undefined` no gate do login:
  `phonePending` e `emailPending` davam ambos falso e o gate NUNCA disparava —
  conta criada e não verificada logava normalmente (o OTP do cadastro era
  decoração). Agora o gate busca `phone_e164` à parte, tolerando 42703.
  **(3) Anti-lockout no cadastro.** `phone_e164` é o marcador de "aguardando
  código" — passou a ser gravado SÓ depois de confirmar que o código saiu
  (`requestOtp` agora devolve `delivered`). Se o Z-API estiver fora, a conta é
  ativada e o cliente entra logado (com `warning`), em vez de ficar preso pedindo
  um código que nunca chega.
  **(4) Duplicidade de telefone.** A checagem olhava só `phone_e164` (NULL em
  todas as contas antigas) → dava para cadastrar de novo um número já existente.
  Agora checa `phone` E `phone_e164`.
  **(5) Enumeração.** `/forgot-password` devolvia `channel: 'whatsapp'|'email'`,
  revelando se a conta existe e se tem WhatsApp. Resposta agora é sempre `{ok:true}`.
  **(6) Financeiro.** Comissões de afiliado CANCELADAS eram subtraídas do
  resultado (dinheiro que ninguém recebe) → agora `.neq('payout_status','cancelled')`.
  E como `commission_platform` só existe a partir de 24/07, períodos com receita
  anterior davam "Resultado plataforma" NEGATIVO (falso prejuízo) → novo flag
  `dados_incompletos` e a tela mostra "—" em vez de número enganoso.
  **(7) Repasse ressuscitado.** `PUT /commissions/:id/pay` usava
  `.neq('payout_status','paid')`, que aceitava `cancelled` → agora
  `.in(['pending','ready'])` e devolve 409 explicativo.
  **PENDENTE (não corrigido):** alta temporada — regras antigas ainda ativas
  recobram todo ano e `rows.find()` não tem desempate entre regras sobrepostas;
  calendário do turista (`/api/seasons`) ainda usa comparação com ano e divergе do
  backend. Ver seção "Em andamento".

- **2026-07-24 · Agente B (Etapa 5 #1 e #2 — afiliados)** — **#1 status
  Pago/Pendente**: no admin (Afiliados.jsx) a coluna Status renderizava **VAZIA**
  — o componente `Badge` recebe `value`, mas a página passava `variant` + children
  (props ignoradas). Fix: `<Badge value={c.payout_status} />` + `pending`/`ready`
  adicionados aos estilos/labels do Badge ('Pendente'/'Pronto p/ pagar'). **#2
  cancelamento avisa o afiliado**: cancelar reserva NÃO mexia na comissão — ela
  ficava `pending` e seria repassada mesmo sem serviço prestado. Novo
  `services/affiliateCommission.js` → `cancelAffiliateCommission(booking)`: marca
  as comissões de afiliado como `payout_status='cancelled'` (valor já existia no
  enum, sem migration), avisa o afiliado no app + **WhatsApp**
  (`notifyAffiliateCommissionCancelled`), é idempotente e NÃO reverte comissão já
  paga (loga pedindo acerto manual). Ligado no `POST /bookings/:id/cancel` (único
  caminho que cancela reserva PAGA; os outros dois só cancelam não-pagas, que não
  têm comissão). UI: turista (Affiliate.jsx) ganha o 3º estado "Cancelada"
  (riscado/cinza, nota "serviço não realizado") e os totais/gráfico/indicações/
  ticket passam a excluir canceladas; admin ganha filtro "Canceladas", badge
  próprio e some o botão "Marcar pago" (nada a repassar) — "A repassar" também
  exclui canceladas. i18n pt/en/es. Builds ok.

- **2026-07-24 · Agente B (Etapa 5 #3 — todas as taxas no Dashboard)** — O
  Financeiro do admin mostrava **Comissão plataforma** e **Repasses** SEMPRE
  zerados: os lançamentos `commission_platform`/`payout_operator` só eram gravados
  por `recordLegAccounting` (motor de pernas), que está DESLIGADO. E a **comissão
  de afiliado** (tabela `commissions`) nunca aparecia no resumo. Fixes: (1)
  `orderCommissionRows(booking,payment,...)` grava comissão da plataforma +
  repasse à cooperativa no nível do pedido quando o motor de pernas está off
  (dentro do insert protegido por `ledger_created`, idempotente; % vem do
  `platform_split_pct` da coop ou do `payment_split_admin_pct` global) — ligado
  nos dois fluxos de aprovação (single + grupo). (2) `/api/admin/financial` passou
  a somar a **comissão de afiliados** (da tabela commissions) e devolve
  `comissoes_afiliados` + `resultado_plataforma` (= comissão plataforma − gateway
  − afiliados); `margem_percent` agora usa o resultado. (3) Financeiro.jsx:
  KPI "Resultado plataforma" e cascata Bruto → (−)Repasse → (−)Gateway →
  (−)Afiliados → Resultado. Build admin ok.

- **2026-07-24 · Agente B (Etapa 5 #4 — sobretaxa de data itemizada)** — A
  sobretaxa de data (alta temporada OU feriado, via `getDateSurcharge`) JÁ era
  somada ao `total_amount`, mas o **carrinho** (`/cart-request`) e o **/request**
  avulso NÃO gravavam a itemização: `subtotal_amount` e `season_additional_amount`
  ficavam no default 0. Resultado: qualquer relatório do admin que some
  `season_additional_amount` mostrava a sobretaxa (inclusive feriado) como "não
  contada". Fix: `computeChargedTotal` passou a devolver `subtotal` +
  `seasonAdditional` (do retorno dos `calculate*` para passeio; do cálculo local
  para transfer tabelado), e os dois inserts de reserva agora gravam
  `subtotal_amount` e `season_additional_amount`. Casa com o item #3 (Dashboard).
  **Bug separado achado (NÃO corrigido ainda)**: alta temporada "Julho–Janeiro"
  nunca aplica — o admin (Temporada.jsx) grava start/end no MESMO ano
  (2026-07-01 → 2026-01-31), e `getSeasonAddition` usa range `start<=data & end>=data`
  → range invertido nunca casa. Precisa de wrap-around/mês-recorrente; deixado
  para o usuário priorizar (é do high season, não do feriado do item #4).

- **2026-07-23 · Agente B (OTP só no cadastro — 2FA de login removido)** —
  Decisão do usuário: OTP serve APENAS para validar a criação da conta; o login
  NÃO pede código (usuário + senha entra direto). **Revertido todo o 2FA de
  login** que havia sido montado: removidos o gate MFA no `/login`,
  `startMfaChallenge`, `POST /auth/mfa/verify`, `POST /auth/mfa/resend`,
  `lib/mfaToken.js`, o `requireDelivery` do `requestOtp`/`sendWhatsappOtp` e o
  diagnóstico temporário `[diag]`. Frontend: removidos o passo `VerifyMfa` do
  Auth.jsx, o card `MfaToggle` do Profile/ProfileDesktop e `mfaVerify`/`mfaResend`
  do api.js. **Cadastro passa a exigir OTP por padrão**: `REQUIRE_SIGNUP_VERIFICATION`
  agora é `!== 'false'` (ligado salvo se `SIGNUP_REQUIRE_VERIFICATION=false`).
  O wizard `VerifyWhatsapp` (que já existia) é o fluxo de ativação. **Depende do
  envio do Z-API funcionar** (mesma entrega que estávamos depurando) — se o envio
  falhar, o cadastro fica pendente; escape: `SIGNUP_REQUIRE_VERIFICATION=false`.
  **migration 063 (mfa_enabled + mfa_challenges) ficou ÓRFÃ** — nada mais usa
  esses objetos; podem ser removidos do banco quando conveniente (drop opcional,
  não incluído para não ser destrutivo). Build turista ok.

- **2026-07-23 · Agente B (Etapa 4 #1 — 2FA por WhatsApp, OBRIGATÓRIA)** — Verificação
  em duas etapas exigida de toda conta com telefone (o fluxo é quase todo por
  WhatsApp). **migration 063** (`063_mfa.sql`): `users.mfa_enabled` nasce **true**
  (NÃO é opt-in do usuário; serve só de válvula de escape de operação — pôr em
  `false` destrava uma conta específica, ex.: admin sem WhatsApp) + tabela `mfa_challenges` (sessão pendente:
  guarda o `refresh_token` do Supabase entre a senha validada e o código, com RLS
  ligada e sem policies → só o backend acessa; vida 10 min, consumo único).
  **API**: `lib/mfaToken.js` (JWT HS256 `purpose:'mfa'`, 10 min, carrega só
  challenge_id+user_id — nenhum segredo de sessão). No `/login`, após validar a
  senha e passar o gate de verificação, se telefone + `isWhatsappEnabled()` e a
  conta não estiver marcada `false`: envia OTP (reaproveita `requestOtp`/`otp_codes` da 023),
  cria o desafio guardando o `refresh_token` e responde `{status:'mfa_required',
  mfa_token, channel, destination}` (NÃO devolve a sessão). Novos endpoints
  `POST /auth/mfa/verify` (confere o código via `verifyOtp`, marca o desafio
  consumido, reidrata a sessão com `refreshSession` do token guardado e devolve
  token/refresh/user) e `POST /auth/mfa/resend`. `GET /me` devolve a flag;
  `PATCH /me` ainda aceita `mfa_enabled` (uso de ops); ambos toleram 42703
  (migration pendente). **FAIL-CLOSED**: se a conta exige 2FA e o código NÃO
  pôde ser entregue (canal fora / envio falhou), o login é BLOQUEADO (503) — não
  devolve sessão. `requestOtp` ganhou `requireDelivery` (lança 502 quando o
  `sendWhatsappOtp` volta `error`/`skipped`; cadastro segue com o default false,
  tolerante). ÚNICA exceção fail-open: 2FA ainda NÃO provisionado (coluna
  `mfa_enabled` 42703 ou tabela `mfa_challenges` 42P01) → segue sem 2º fator para
  não brickar o acesso entre o deploy e o `migrate`. **Só TURISTAS**: admin e
  cooperativa (operator, login por CNPJ) NÃO passam pelo 2º fator. Escape de
  operação: `UPDATE users SET mfa_enabled=false` destrava um turista específico.
  Turista sem telefone continua passando (não há canal p/ o código).
  **Turista**: Auth.jsx ganha o passo `VerifyMfa` (tela de código no login) e
  trata `mfa_required`; o bloqueio 503 aparece como erro no login.
  Profile/ProfileDesktop mostram o card `MfaToggle` (informativo: "Ativa /
  obrigatória", alerta se faltar telefone). api.js: `mfaVerify`, `mfaResend`.
  Build turista ok. **Rodar no Supabase: migration 063.**

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
