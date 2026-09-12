# Auditoria de segurança — Turiva

Data: 2026-09-12 · Branch `claude/giro-jeri-platform-GFBFR`

Este documento separa três coisas que costumam ser confundidas:

| Rótulo | Significado |
|---|---|
| **Corrigido no código** | A mudança está no repositório e passa nos testes. |
| **Validado localmente** | Executado contra o app rodando aqui, com dados de teste. |
| **Publicado e verificado** | Em produção, conferido. **Nada neste documento está nesse estado** — nenhuma publicação foi feita. |

Nenhuma cobrança real foi feita. Nenhum dado de cliente foi acessado. Nenhum DNS, hospedagem ou configuração de produção foi alterado.

---

## 1. Problemas confirmados

### 1.1 CRÍTICO — o cliente podia definir o valor cobrado

`packages/api/src/routes/payments.js` · `computeChargedTotal`

O servidor recalcula o preço, e o comentário dizia "o cliente nunca define o valor cobrado". Mas **todo caminho que não conseguia calcular caía em `Number(total_price)`** — o valor vindo do navegador:

- o `catch` de qualquer exceção;
- passeio sem `region_id`, `service_date_iso` ou `service_id`;
- passeio privativo com `vehicles: []`;
- transfer cujo `service_id` não casa com nenhuma rota;
- qualquer `service_type` fora de `tour`/`transfer`.

`region_id` é **opcional** no schema Zod, mas **obrigatório** para o recálculo. Bastava omiti-lo para nenhum cálculo rodar e a cobrança sair pelo valor escolhido pelo cliente. O mínimo do schema (R$ 1,00) nunca foi defesa de preço — era o alvo.

**Correção:** `computeChargedTotal` devolve `autoritativo`. Os três chamadores recusam com **422** quando o servidor não calculou. Valor não calculado nunca vira cobrança.

**Falso positivo descartado:** na entrada de `POST /intent`, `chargedTotal = Number(total_price)` para reserva existente *parece* explorável, mas é sobrescrito pelo total do banco antes de qualquer uso. Não era falha; o código foi reescrito para não induzir ao erro.

### 1.2 ALTO — IDOR em `GET /api/payments/:id/status`

Sem verificação de dono. Além de devolver `raw_response_json` (resposta crua do gateway), **a rota tem efeito colateral**: expira cobrança e reserva, e aprova pagamento de teste. Qualquer usuário autenticado podia **expirar a cobrança pendente de outra pessoa**.

**Correção:** `podeVerPagamento()` antes de qualquer efeito — turista dono, dono de reserva do grupo, operador atribuído, admin/finance. Negativa responde **404**, não 403, para não confirmar que o id existe.

### 1.3 ALTO — operador alterava reserva de concorrente

`PATCH /api/bookings/:id/status` exigia `requireOperator`, que garante que quem chamou **é** operador — não que a reserva é **dele**. Qualquer operador podia concluir ou cancelar a corrida de outro.

**Correção:** o recorte `operator_id = req.user.id` foi para dentro do próprio `UPDATE` (não um `SELECT` antes), para não abrir janela entre conferir e gravar. Admin segue sem recorte.

### 1.4 MÉDIO — open redirect no destino pós-login

A guarda era `/^\/(?!\/)/`. Ela bloqueia `//evil.com`, mas **deixa passar `/\evil.com`**: o segundo caractere é barra invertida, o lookahead aprova, e o navegador normaliza `\` para `/` e trata como protocolo-relativo. Redirecionamento para fora do site logo após o login — o cenário clássico de phishing.

Rodava em três lugares: `Auth.jsx` (`?next=` e `state.from`), `Login.jsx` (**sem validação nenhuma**) e `App.jsx` (roteador 404 do GitHub Pages, via `sessionStorage`, controlável por link).

**Correção:** `packages/turista/src/lib/destinoSeguro.js`, que normaliza barra invertida e remove caracteres de controle antes de testar. É o mesmo defeito do aviso `GHSA-wrjc-x8rr-h8h6` do react-router, mas este vivia no nosso código e não dependia da versão da biblioteca.

### 1.5 ALTO — operador recebia todas as reservas da plataforma

Segunda passada, depois da revisão do relatório. `GET /api/bookings` recortava
**apenas o turista**: operador e agência recebiam **todas as reservas da
plataforma**, paginadas, incluindo as de concorrentes — com destino, cliente e
valores. `GET /api/bookings/:id` tinha o mesmo buraco: barrava só o turista de
outro, então um operador abria qualquer reserva, com contato do cliente.

Eu havia classificado isso como risco aceito ("operadores precisam ver a fila").
**Estava errado**: a fila de aceite tem rota própria, `GET /api/operator/bookings`,
que filtra `operator_id IS NULL` e **não seleciona nenhum dado pessoal do
cliente** (conferido: sem join com `users`, sem `phone`, `email`, `full_name` ou
`cpf`). O app do operador só chama `/api/bookings/:id/status` — nunca a lista
genérica. Recortar era seguro e foi feito.

**Correção:** operador e agência veem apenas `operator_id = req.user.id`; perfil
desconhecido recebe lista **vazia** (negar é o padrão); `GET /:id` responde 404
para quem não é dono, operador atribuído ou admin.

### 1.6 BAIXO — ausência de cabeçalhos de segurança no frontend

Confirmado. Ver §3 — é limitação da hospedagem, não descuido de código.

---

## 2. O que foi verificado e está correto

Registrado para não ser "corrigido" por engano depois:

- **CORS** (`index.js`): allowlist explícita a partir de `TURISTA_URL`/`COOP_URL`/`ADMIN_URL`, sem reflexão de `Origin`, `credentials: true` só para origens autorizadas, `localhost` apenas fora de produção. Nada a mudar.
- **Webhook do Mercado Pago**: HMAC-SHA256 sobre o manifest documentado, comparação com `timingSafeEqual`, **rejeita em produção** quando o secret falta, idempotência por evento. Correto.
- **Autenticação**: `supabase.auth.getUser(token)` valida assinatura e expiração **no servidor** — não é token apenas decodificado.
- **Senhas**: geridas pelo Supabase Auth (bcrypt). O código nunca vê, grava ou registra senha em texto puro.
- **Rate limiting**: presente em login, registro, recuperação, reset, refresh, OTP e ativação de afiliado, com `trust proxy` configurado para o Render.
- **Consultas ao banco**: tudo via supabase-js (parametrizado). Não há SQL concatenado.
- **`Access-Control-Allow-Origin: *` em estáticos públicos**: é o comportamento normal do GitHub Pages para arquivos públicos. Não expõe dado privado.

---

## 3. Cabeçalhos de segurança — o limite é a hospedagem

**O GitHub Pages não permite definir cabeçalhos HTTP de resposta.** Não existe arquivo, regra ou ajuste que faça isso. Portanto:

| Cabeçalho | Possível hoje? |
|---|---|
| `Referrer-Policy` | **Sim**, via `<meta name="referrer">` — **aplicado** |
| `Content-Security-Policy` | Via `<meta>`, com duas perdas graves (abaixo) — **preparado, não ligado** |
| `X-Content-Type-Options` | Não |
| `Strict-Transport-Security` | Não |
| `Permissions-Policy` | Não |
| `frame-ancestors` / `X-Frame-Options` | **Não** — e é o que protege contra clickjacking |

As duas perdas do CSP em `<meta>`:
1. **Não existe `Report-Only`** — não dá para fazer implantação gradual, que é justamente o que §3 pede.
2. **`frame-ancestors` é ignorado** pela especificação.

Por isso a CSP foi **preparada e testada, mas não ligada**. Ligá-la sem validar o checkout real seria arriscar derrubar o pagamento — e o checkout do Mercado Pago **não pôde ser validado aqui** (o ambiente de teste bloqueia `sdk.mercadopago.com` e não se faz cobrança real numa auditoria).

O arquivo `packages/turista/public/_headers` traz a configuração completa, versionada, com um aviso no topo de que **não tem efeito na hospedagem atual**.

### Plano de implantação

**Opção A — mover o frontend para hospedagem com cabeçalhos (recomendada).**
Cloudflare Pages ou Netlify leem `_headers` como está. Resolve tudo de uma vez: nosniff, HSTS, Permissions-Policy, frame-ancestors e CSP com Report-Only.

1. Criar o site apontando para este repositório, build `npm run build --workspace=packages/turista`, diretório `packages/turista/dist`.
2. Replicar as variáveis do workflow: `VITE_API_URL`, `VITE_MP_PUBLIC_KEY`, `VITE_GOOGLE_MAPS_KEY`.
3. Validar no domínio de prévia **antes** de tocar no DNS: login, mapa, reserva e checkout.
4. Subir a CSP primeiro em `Content-Security-Policy-Report-Only`, coletar violações por alguns dias, só então impor.
5. Só depois apontar `turivabrasil.com`.
6. **Reversão:** voltar o DNS para o GitHub Pages. O workflow atual continua funcionando e o `_headers` é ignorado lá — nada quebra.

**Opção B — ficar no Pages.** Ligar a CSP por `<meta>` (descomentando a linha em `index.html`) aceitando que não haverá proteção contra clickjacking nem implantação gradual. Exige validar o checkout em homologação primeiro.

---

## 4. Sessão (`giro_token` / `giro_refresh`) — por que NÃO troquei para cookie

A sessão é do **Supabase Auth (GoTrue)**, não implementação própria. Rotação de refresh token, detecção de reuso, expiração e revogação já são responsabilidade dele; o logout chama `supabase.auth.admin.signOut(token)`, que revoga do lado do servidor. Os itens de rotação/revogação do escopo, portanto, **já estão atendidos** — não por acidente do nosso código, mas por usar GoTrue.

O risco real é o restante: **token em `localStorage` é legível por JavaScript**, então um XSS leva a sessão.

A correção pedida (cookie `HttpOnly`) **não é aplicável na arquitetura atual**, e ligá-la quebraria o login:

- Frontend: `turivabrasil.com` (GitHub Pages)
- API: `giro-jeri-api.onrender.com` (Render)

São **sites diferentes**. O cookie seria de terceiros, exigindo `SameSite=None; Secure` — que o Safari (ITP) bloqueia por padrão e o Chrome vem restringindo. O resultado seria login quebrado em parte dos navegadores.

**Pré-requisito para fazer certo:** colocar a API num subdomínio do site — `api.turivabrasil.com` apontando para o serviço do Render. Aí o cookie vira primário (`Domain=.turivabrasil.com; SameSite=Lax; Secure; HttpOnly; Path=/`), e só então vale implementar, junto com proteção CSRF (token por sessão nas operações de escrita — `SameSite` sozinho não basta).

Isso é mudança de DNS e infraestrutura, que o escopo proíbe fazer automaticamente. **Não fiz o "conserto de fachada"** de trocar `localStorage` por `sessionStorage`: não reduz o risco de XSS e só dificultaria a migração real.

Mitigação que **foi** feita, e que ataca o vetor de verdade: CSP sem `unsafe-inline`/`unsafe-eval` em `script-src` (preparada) e o open redirect corrigido.

---

## 5. Dependências

`npm audit --omit=dev`: **9 vulnerabilidades (1 alta) → 3 moderadas**, com `npm audit fix` (sem `--force`). Testes seguem passando.

Restantes, todas moderadas, **conscientemente não corrigidas**:

- **`react-router`** — a correção é `react-router-dom@7`, mudança de major nas quatro SPAs. O aviso relevante era o open redirect por barra invertida, que **foi corrigido no nosso próprio código** (§1.4), então a exposição prática está fechada. A atualização de major deve ser feita como tarefa própria, com regressão de rotas.
- **`ws`** (era a **alta**, `8.20.0` via `@supabase/realtime-js` → `@supabase/supabase-js`, só no **admin**) e **`uuid`** (`<11.1.1`, via SDK `mercadopago`) — **resolvidas** pelo `audit fix`.
- **`qs@6.14.2`** (moderada, 3 avisos: `GHSA-4mjr-xmp4-gh2g`, `GHSA-q8mj-m7cp-5q26`, `GHSA-x5fp-wj9c-mxmx`). Vem de `express@4.22.1`, que **fixa `qs` em `~6.14.0`** — por isso o `audit fix` não conseguiu subir. A versão corrigida é `6.16.0`, e `body-parser@1.20.8` **já a usa** nesta mesma árvore; o `qs` vulnerável fica só no parser de query string do Express. Tentei forçar via `overrides` no `package.json`: o npm 10.9.7 aplica a substituição em `express` mas deixa a raiz em `6.14.2` marcada como `invalid`, e `npm ls` passa a sair com erro — o que quebraria CI. **Revertido.** A correção real é **Express 5** (major), que deve ser tarefa própria.

**Impacto no uso real:** os três avisos do `qs` são DoS por query string maliciosa. O app não expõe endpoint que dependa de query aninhada complexa, e há `express-rate-limit` em toda a `/api/`. Risco baixo na prática, mas continua aberto.

## 6. Segredos

Varredura em código, workflows e build: **nenhum segredo encontrado no repositório**. Tudo vem de `secrets`/`envVars` (`render.yaml`, `deploy-turista.yml`). Nada foi impresso em log, commit ou neste documento.

**`VITE_GOOGLE_MAPS_KEY`** é chave de navegador e **é pública por natureza** — aparece no JS compilado por definição, e isso não é vazamento. O que importa são as restrições no Google Cloud, que **não tenho como verificar** (sem acesso ao console). Pendente de conferência, não de correção:

1. Restrição por referenciador HTTP: `https://turivabrasil.com/*`.
2. Restrição de APIs: só Maps JavaScript e Places.
3. Chave **separada** para o servidor (`GOOGLE_MAPS_API_KEY` no Render), restrita por IP e **nunca** por referenciador.
4. Cota diária e alerta de orçamento.

---

## 7. Riscos remanescentes

- **Sessão em `localStorage`** — depende da migração do §4.
- **Clickjacking** — impossível de corrigir no GitHub Pages.
- **CSP não imposta** — preparada, aguardando validação do checkout.
- **`GET /bookings/:id` legível por qualquer operador** — deliberadamente **não** alterado: operadores precisam ver reservas na fila para aceitá-las. Restringir quebraria o fluxo de aceite. Vale revisar quais campos de cliente a rota expõe antes do aceite.
- **Webhook sem checagem de idade do timestamp** — um evento capturado pode ser reenviado indefinidamente. O efeito financeiro é neutralizado pela idempotência, por isso a prioridade é baixa.
- **`react-router` v6** — ver §5.

## 8. Limites desta validação

- Tudo local, com API e dados **mockados**. Nenhum acesso a Supabase, Mercado Pago, Render ou Google Cloud de produção.
- Nenhuma cobrança real. Nenhum fluxo de pagamento de ponta a ponta.
- Não há lint nem verificação de tipos no projeto — não existe script para isso.
- A CSP foi validada em **home, /passeios e /transfers**. O **checkout não foi validado**.
- Os testes de autorização conferem a **presença** do recorte no código, não uma chamada HTTP real com duas contas — que exigiria banco de produção.
