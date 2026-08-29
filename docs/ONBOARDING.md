# Giro Jeri — Relatório Completo do Projeto

> Documento de onboarding técnico. Serve para integrar um novo desenvolvedor /
> uma nova sessão de IA (claude.ai) ao projeto e trabalhar em paralelo.
> Atualizado em 2026-06-26.

---

## 1. O que é o Giro Jeri

Plataforma digital de reservas de **passeios** e **transfers** em Jericoacoara
(Ceará) e região. Conecta **turistas** a **operadores** de transporte/turismo,
com pagamento online e split automático (cada operador recebe sua parte
direto, a plataforma fica com uma comissão).

**Modelo de operação (estilo Uber / marketplace):**
1. Turista **solicita** um passeio/transfer (sem pagar ainda).
2. A primeira **operador** disponível **aceita** a corrida.
3. O turista é avisado e **paga** (PIX ou cartão via Mercado Pago).
4. O operador **confirma**, **inicia** e **conclui** o serviço.

---

## 2. URLs em produção

| App | URL | Quem acessa |
|-----|-----|-------------|
| **Turista** | https://sobrejeri.github.io/giro-jeri/ | Público |
| **Operador** | https://sobrejeri.github.io/giro-jeri/operador/ | `operator` / `admin` |
| **Admin** | https://sobrejeri.github.io/giro-jeri/admin/ | `admin` |
| **API** | https://giro-jeri-api.onrender.com | Backend (Render) |

- Repositório GitHub: `sobrejeri/giro-jeri`
- Branch de desenvolvimento/deploy atual: **`claude/giro-jeri-platform-GFBFR`**
- Supabase (projeto): `https://poqiioyadddbuxcohwjy.supabase.co`

---

## 3. Stack tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + TanStack Query (React Query) |
| Roteamento | React Router |
| Backend | Node.js 20 + Express |
| Banco de dados | Supabase (PostgreSQL) com RLS |
| Autenticação | Supabase Auth (JWT) |
| Storage de imagens/vídeo | Supabase Storage (buckets `tour-images`, `avatars`) |
| Pagamentos | Mercado Pago (Payment Brick — PIX + cartão, com split marketplace) |
| E-mail transacional | Resend |
| WhatsApp | Z-API (e links `wa.me` diretos) |
| Push notifications | Web Push (VAPID) |
| Geolocalização | Geoapify (diretório) + Google Maps / Nominatim (geocoding) |
| Deploy frontend | GitHub Pages (`peaceiris/actions-gh-pages`) |
| Deploy API | Render.com (free tier) |
| Monorepo | npm workspaces |

---

## 4. Estrutura do monorepo

```
giro-jeri/
├── packages/
│   ├── turista/        # App do turista (mobile-first)
│   ├── operador/    # Painel do operador/operador
│   ├── admin/          # Painel administrativo
│   └── api/            # Backend Express
│       └── src/
│           ├── index.js          # bootstrap Express, CORS, rate limit, rotas
│           ├── supabase.js       # client service_role (bypassa RLS)
│           ├── middleware/        # auth.js (JWT + roles), errorHandler.js
│           ├── routes/            # uma rota por domínio (ver §11)
│           ├── services/          # email, geo, geoapify, mercadoPago,
│           │                      # notify, otp, priceEngine, webpush, whatsapp
│           ├── payments/          # helpers de pagamento
│           └── lib/
├── supabase/
│   ├── migrations/     # 001 → 036 (ver §8)
│   ├── scripts/
│   └── config.toml
├── e2e/                # testes Playwright
├── render.yaml         # deploy da API
└── .github/workflows/  # ci.yml, deploy-turista.yml, keep-api-warm.yml
```

### Páginas por app

**Turista** (`packages/turista/src/pages/`): Home / HomeDesktop, Tours /
ToursDesktop, TourDetail, Transfers / TransfersDesktop, Bookings, BookingDetail,
Feed, Profile / ProfileDesktop, Auth, Login, Register, Legal, `checkout/`.
Contexts: `AuthContext`, `RegionContext` (detecção de município por GPS).

**Operador** (`packages/operador/src/pages/`): Dashboard, Reservas
(corridas: Disponíveis / Cotações / Minhas), Despacho, Veiculos, Financeiro,
Passeios, Rotas, Perfil (incl. conexão Mercado Pago), Login.

**Admin** (`packages/admin/src/pages/`): Dashboard, Catalogo, Precos,
Estabelecimentos, Reservas, Usuarios, Financeiro, Cupons, Temporada, Regioes,
Stories, Feed, Configuracoes, Auditoria, Perfil, Login.

---

## 5. Autenticação e perfis

- Auth via **Supabase Auth** (JWT). O backend valida o token com
  `supabase.auth.getUser(token)` no middleware `authenticate`.
- A tabela `users` tem RLS: `auth.uid()::text = auth_id::text`.
- O backend usa a **service_role key** para operações que precisam ignorar RLS,
  e um client com o JWT do usuário (`req.supabase`) para queries sob RLS.

**Perfis (`user_type`):**

| Perfil | Acesso | Login |
|--------|--------|-------|
| `tourist` | App turista — reservas, pagamentos | e-mail/telefone + senha |
| `operator` | Painel operador — operação, despacho, cotações | **CNPJ** + senha |
| `admin` | Acesso total — catálogo, usuários, financeiro | e-mail + senha |
| `agency`, `finance`, `affiliate` | reservados (pouco/não usados) | — |

- **Operador faz login por CNPJ**: o admin cadastra o operador e o sistema
  gera um e-mail sintético interno `<cnpj>@op.girojeri.app`. O login traduz o
  CNPJ para esse e-mail.
- **Cadastro de turista é direto** (sem código de verificação), controlado pela
  env `SIGNUP_REQUIRE_VERIFICATION` (default desligado). Quando ligado, exige
  verificação por OTP (e-mail/WhatsApp).

---

## 6. Fluxo de reserva e enums de status

Reformulado para **solicitar → aceitar → pagar** (migration 035).

`status_commercial` (ciclo comercial):
```
draft
awaiting_acceptance   ← solicitada, aguardando um operador aceitar
awaiting_payment      ← operador aceitou; turista precisa pagar
paid                  ← pago
payment_failed | cancelled | refunded
```

`status_operational` (ciclo operacional):
```
new → awaiting_dispatch → confirmed → assigned → in_progress → completed
(+ cancelled, no_show…)
```

**Transições principais (rotas do operador):**
- `POST /api/operator/bookings/:id/accept` — `awaiting_acceptance → awaiting_payment` (atômico: primeiro a aceitar leva).
- `POST .../confirm` — manda para despacho (só após pago).
- `POST .../start` — `in_progress`.
- `POST .../complete` — `completed`.

---

## 7. Banco de dados (Supabase / PostgreSQL)

- 30+ tabelas. Schema base em `001_schema_completo.sql`.
- RLS habilitado nas tabelas sensíveis (users, bookings, payments…).
- Migrations versionadas em `supabase/migrations/` (rodar no SQL Editor do
  Supabase, **em ordem numérica**).

**Migrations (001 → 036):** schema completo, locations/quotes, perfil turista,
storage avatars, seed de dados reais, preferências do operador, raio de região,
geofiltering, dados bancários do operador, CNPJ, gateway de pagamento, split %,
recipient id, operador no booking, capa/banner, cutoff de tour, feed,
estabelecimentos+promos, engajamento, **catálogo real de Jericoacoara**,
notificações+push, ledger/idempotência, ativar Mercado Pago, RLS insert de
pagamentos, OTP/verificação (023), colunas de cartão, coords de estabelecimentos,
multi-região, stories + highlights, **034 RLS de escrita do catálogo (admin)**,
**035 status awaiting_acceptance**, **036 conexão Mercado Pago marketplace**.

> ⚠️ **ATENÇÃO — gap de migrations no banco em produção.** O banco do Supabase
> está com algumas migrations **não aplicadas** (notadamente a **023
> OTP/verification**, que cria `phone_e164` e tabelas de OTP; e provavelmente
> outras posteriores). Por isso parte do código foi escrita para **funcionar sem
> elas** (ex.: cadastro direto sem `phone_e164`). Antes de assumir que uma coluna
> existe, **confirme no Supabase**. Migrations a garantir aplicadas: **034, 035,
> 036** (necessárias para o fluxo aceitar→pagar e o split). A 035 precisa rodar
> **sozinha** (ALTER TYPE … ADD VALUE não roda dentro de transação).

---

## 8. Integrações externas

| Integração | Para quê | Onde configurar |
|-----------|----------|-----------------|
| **Supabase** | Banco, Auth, Storage | painel Supabase → Settings → API |
| **Mercado Pago** | Pagamento PIX/cartão (Payment Brick) | mercadopago.com.br → Suas integrações |
| **Mercado Pago Marketplace (OAuth)** | Split: cada operador recebe direto; plataforma cobra `application_fee` | app marketplace no painel MP |
| **Geoapify** | Diretório "Descubra a Vila" (POIs OSM) | myprojects.geoapify.com |
| **Google Maps** | Geocoding / reverse geocoding (município) | Google Cloud Console |
| **Resend** | E-mails transacionais (confirmação de reserva) | resend.com |
| **Z-API** | Mensagens WhatsApp | z-api.io |
| **Web Push (VAPID)** | Notificações no navegador/app | chaves VAPID geradas |

### Mercado Pago — split marketplace (estado)
- Código pronto (`services/mercadoPago.js`, `routes/mpOauth.js`, migration 036).
- Para **ativar o split** falta (lado config): definir no Render `MP_CLIENT_ID`,
  `MP_CLIENT_SECRET`, `MP_OAUTH_RETURN_URL`; cada operador **conecta** a conta
  MP em **Perfil → Conectar Mercado Pago**; admin define o **percentual de
  comissão** da plataforma. Sem isso, paga-se na conta única da plataforma.

---

## 9. Variáveis de ambiente (NOMES — valores NÃO ficam no repositório)

> 🔒 **Segurança:** os valores reais das chaves **não** estão no Git (ficam só no
> Render e no GitHub Secrets). **Não cole `SUPABASE_SERVICE_ROLE_KEY`, tokens do
> Mercado Pago, `RESEND_API_KEY`, segredos de webhook/OTP em chat, e-mail ou em
> documento público.** A `*_ANON_KEY` e a `VITE_MP_PUBLIC_KEY` são públicas por
> design (vão no bundle do frontend). Para dar acesso a um novo dev, compartilhe
> os segredos pelo próprio painel (Render / Supabase) ou um cofre seguro.

### API (Render — `render.yaml`)
```
SUPABASE_URL                     # URL do projeto Supabase
SUPABASE_SERVICE_ROLE_KEY        # 🔒 service role (bypassa RLS) — NUNCA expor
NODE_ENV=production
TURISTA_URL / COOP_URL / ADMIN_URL   # https://sobrejeri.github.io (CORS)
GEOAPIFY_API_KEY                 # 🔒 Geoapify
MP_ACCESS_TOKEN                  # 🔒 token de produção do Mercado Pago
MERCADO_PAGO_WEBHOOK_SECRET      # 🔒 assinatura do webhook MP
RESEND_API_KEY                   # 🔒 Resend
EMAIL_FROM                       # remetente (ex.: Giro Jeri <onboarding@resend.dev>)
# Split marketplace (para ativar o split):
MP_CLIENT_ID / MP_CLIENT_SECRET  # 🔒 app marketplace MP
MP_OAUTH_RETURN_URL              # URL de retorno do OAuth
# Opcionais / fluxos extras:
GOOGLE_MAPS_API_KEY              # 🔒 geocoding server-side
WHATSAPP_NUMBER                  # número padrão
ZAPI_BASE_URL / ZAPI_INSTANCE_ID / ZAPI_INSTANCE_TOKEN / ZAPI_CLIENT_TOKEN  # 🔒 Z-API
OTP_PEPPER / SIGNUP_TOKEN_SECRET # 🔒 segredos (≥32 bytes) — só se usar OTP
SIGNUP_REQUIRE_VERIFICATION      # 'true' liga verificação no cadastro
VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  # 🔒 push (a privada é secreta)
```

### Frontends (GitHub Secrets — usados no build do `deploy-turista.yml`)
```
VITE_API_URL              # URL da API no Render
VITE_SUPABASE_URL         # URL do Supabase
VITE_SUPABASE_ANON_KEY    # anon key (pública)
VITE_MP_PUBLIC_KEY        # public key do Mercado Pago (pública)
VITE_GOOGLE_MAPS_KEY      # chave Maps do front (restrinja por domínio!)
VITE_ADMIN_WHATSAPP       # (operador) WhatsApp do admin p/ "esqueci a senha"
```

---

## 10. Superfície da API (principais endpoints)

Base: `https://giro-jeri-api.onrender.com`. Níveis: **pub** (público),
**auth** (logado), **op** (operator/admin), **adm** (admin).

**Auth** `/api/auth`: `POST /register`, `POST /login`, `GET /me` (auth),
`POST /refresh`, `POST /forgot-password`, `PATCH /me`, `POST /me/photo`,
`POST /me/cover`, `POST /logout`. OTP em `/api/auth/otp` (`/request`, `/verify`).

**Catálogo público**: `GET /api/regions`, `GET /api/tours`, `GET /api/tours/:id`,
`GET /api/tours/:id/vehicles`, `POST /api/tours/:id/suggest-vehicles`,
`POST /api/tours/:id/calculate`, `GET /api/transfers`, `GET /api/transfers/routes`,
`POST /api/transfers/calculate`, `GET /api/vehicles`,
`GET /api/establishments`, `GET /api/feed`, `GET /api/stories`,
`GET /api/settings/public`.

**Cotações** `/api/transfers/quotes`: `POST /` (auth), `GET /pending` (op),
`GET /history` (op), `PATCH /:id/quote` (op), `POST /:id/accept|reject|cancel`.

**Reservas** `/api/bookings`: `POST /`, `GET /`, `GET /:id`, `POST /:id/cancel`,
`PATCH /:id/status` (auth).

**Pagamentos** `/api/payments`: `POST /intent`, `POST /request` (solicitar sem
pagar), `GET /booking/:id/checkout-key`, `GET /:id/status`,
`POST /webhook` (MP), `POST /manual-confirm` (adm).

**Operador** `/api/operator` (op): `GET/PATCH /profile`,
`GET /preferences`, `PUT /preferences/:type/:id`, `GET /bookings`,
`POST /bookings/:id/accept|start|confirm|complete`.

**Catálogo (escrita)** `/api/catalog` (op lê, **adm** escreve): `tours`,
`transfers`, `transfer-routes`, `categories` (GET/POST/PUT/DELETE).

**Mercado Pago OAuth** `/api/mp` (op): `GET /connect-url`, `GET /status`,
`POST /disconnect`, `GET /callback`.

**Admin** `/api/admin` (adm): `stats`, `users` (+`/:id` PATCH,
`/:id/reset-password`, `/:id/register-recipient`), `financial`,
`financial-daily`, `operational` (+`/:id/assign`), `audit-logs`, `settings`,
`site-image`, `storage-sign`, `coupons`, `seasons`, `holidays`,
`pricing-rules`, `operator-performance`, `bookings` (+`/manual`).

**Notificações** `/api/notifications` (auth): `GET /`, `POST /read-all`,
`POST /:id/read`, `GET /vapid-public-key`, `POST /push-subscribe`.

---

## 11. Deploy & CI/CD

- **API → Render** (`render.yaml`): build `npm install`, start
  `npm run start --workspace=packages/api`. **Auto-deploy** ao dar push na branch.
  Free tier "dorme" — há `keep-api-warm.yml` para manter quente.
- **Frontends → GitHub Pages** (`.github/workflows/deploy-turista.yml`): em push
  para `main` ou `claude/giro-jeri-platform-GFBFR`, builda os 3 apps, mescla em
  `dist/` (turista na raiz, `/operador`, `/admin`), cria `404.html` p/ SPA, e
  publica em `gh-pages` via `peaceiris/actions-gh-pages`.
- **CI** `ci.yml` roda checagens. Testes E2E em `e2e/` (Playwright).

---

## 12. Estado atual, correções recentes e pendências

**Correções recentes (branch `claude/giro-jeri-platform-GFBFR`):**
- `feat(auth)`: cadastro de turista direto, sem código de verificação.
- `fix(turista)`: localização por **município** (sem filtro de raio); região
  escolhida à mão tem prioridade sobre o GPS.
- `fix`: solicitar transfer falhava com "Expected number, received NaN"
  (`unit_price` virou opcional no backend e é enviado pelo front).
- `fix(api)`: operador não via reservas `awaiting_acceptance` (a query `.or()`
  aninhada foi trocada por duas consultas explícitas).
- `fix(auth)`: middleware passou a buscar o perfil via **service_role** (evita
  403 por RLS) + logs de diagnóstico.
- `fix(api)`: **salvar rota de transfer** dava 404 — o front reenviava o join
  `transfers` e campos read-only; o backend agora usa **whitelist de colunas**.

**Pendências conhecidas:**
- Confirmar no Supabase que **034/035/036** estão aplicadas (e avaliar a 023).
- **Ativar o split** do Mercado Pago (env no Render + operadores conectarem a
  conta + % de comissão) — ver §8.
- 403 do operador: se persistir após deploy, checar nos logs do Render
  `[auth] conta inativa` (campo `is_active=false` em `users`) ou
  `[auth] perfil não encontrado` (vínculo `auth_id`).

---

## 13. Rodar localmente

```bash
# 1. Banco: rode as migrations no SQL Editor do Supabase (001 → 036, em ordem)
# 2. Variáveis:
cp packages/api/.env.example packages/api/.env          # preencha SUPABASE_*
# crie packages/operador/.env e packages/admin/.env com VITE_SUPABASE_* e VITE_API_URL
# 3. Instalar e rodar tudo:
npm install
npm run dev:all     # API(3001) + turista(5173) + operador(5174) + admin(5175)
```

---

## 14. Convenções de desenvolvimento

- **Branch**: desenvolver e dar push em `claude/giro-jeri-platform-GFBFR`
  (essa branch dispara os deploys). O usuário também commita direto nela — antes
  de push, `git fetch` + `git rebase origin/<branch>`.
- **Commits**: mensagem clara em PT, prefixo `feat/fix/chore(escopo)`.
- **Idiomas da UI**: pt (principal), en, es.
- **Banco é fonte de verdade**: dada a defasagem de migrations, sempre verifique
  colunas/enums reais no Supabase antes de codar contra eles.
- **Service role só no backend** — nunca no frontend.

---

## 15. Resumo de "chaves" (como dar acesso a um novo dev/IA sem vazar segredo)

| Item | Sensível? | Onde o novo dev obtém |
|------|-----------|------------------------|
| Código-fonte | não | GitHub `sobrejeri/giro-jeri` (dar acesso de colaborador) |
| `SUPABASE_URL`, `*_ANON_KEY`, `VITE_MP_PUBLIC_KEY` | público | painel Supabase / MP |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔒 alto | painel Supabase (compartilhar com cautela) |
| Tokens Mercado Pago / webhook secret | 🔒 alto | painel Mercado Pago |
| `RESEND_API_KEY`, `GEOAPIFY_API_KEY`, Z-API, Google Maps | 🔒 | painéis respectivos |
| `OTP_PEPPER`, `SIGNUP_TOKEN_SECRET`, VAPID private | 🔒 | Render (env) |

Para a outra sessão de IA trabalhar em paralelo, o que importa é **este
documento + acesso ao repositório**. Segredos só se ela for rodar/deployar — e
mesmo assim via Render/Supabase, não em texto plano.
