# Giro Jeri

Plataforma digital de reservas para passeios e transfers em Jericoacoara.

---

## Apps em produção

| App | URL | Acesso |
|-----|-----|--------|
| Turista | https://sobrejeri.github.io/giro-jeri/ | Público |
| Cooperativa | https://sobrejeri.github.io/giro-jeri/cooperativa/ | `operator` ou `admin` |
| Admin | https://sobrejeri.github.io/giro-jeri/admin/ | `admin` |
| API | https://giro-jeri-api.onrender.com | Backend (Render) |

---

## Estrutura do projeto

```
giro-jeri/
├── packages/
│   ├── turista/        # App do turista (React + Vite, mobile-first)
│   ├── cooperativa/    # Dashboard da cooperativa (React + Vite)
│   ├── admin/          # Dashboard administrativo (React + Vite)
│   └── api/            # Backend Node.js + Express
│       └── src/
│           ├── index.js
│           ├── supabase.js
│           ├── middleware/     auth.js, errorHandler.js
│           ├── routes/         auth, tours, transfers, bookings,
│           │                   payments, regions, admin, vehicles, catalog
│           └── services/       priceEngine.js
├── supabase/
│   └── migrations/
│       ├── 001_schema_completo.sql
│       └── 002_locations_and_quotes.sql
├── render.yaml                 # Configuração deploy API no Render
└── .github/workflows/
    └── deploy-turista.yml      # CI/CD GitHub Pages (3 apps)
```

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + TanStack Query |
| Backend | Node.js 20 + Express |
| Banco de dados | Supabase (PostgreSQL) |
| Autenticação | Supabase Auth (JWT) |
| Storage de imagens | Supabase Storage (bucket `tour-images`) |
| Deploy frontend | GitHub Pages (via `peaceiris/actions-gh-pages`) |
| Deploy API | Render.com (free tier) |
| Pagamentos | Mercado Pago (integração pendente) |

---

## Configuração local

### 1. Pré-requisitos

- Node.js 20+
- Conta no [Supabase](https://supabase.com)

### 2. Banco de dados

Execute no **SQL Editor** do Supabase na ordem:

```
supabase/migrations/001_schema_completo.sql
supabase/migrations/002_locations_and_quotes.sql
```

Crie o bucket de imagens:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('tour-images', 'tour-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "upload_tour_images" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tour-images');

CREATE POLICY "public_tour_images" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'tour-images');
```

### 3. Variáveis de ambiente

```bash
cp packages/api/.env.example packages/api/.env
```

```env
# packages/api/.env
SUPABASE_URL=https://poqiioyadddbuxcohwjy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
NODE_ENV=development
PORT=3001
TURISTA_URL=http://localhost:5173
COOP_URL=http://localhost:5174
ADMIN_URL=http://localhost:5175
```

```bash
# packages/cooperativa/.env e packages/admin/.env
VITE_SUPABASE_URL=https://poqiioyadddbuxcohwjy.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_API_URL=http://localhost:3001
```

### 4. Instalar e rodar

```bash
npm install
npm run dev:all       # API + turista + cooperativa + admin
```

| App | URL local |
|-----|-----------|
| Turista | http://localhost:5173 |
| Cooperativa | http://localhost:5174 |
| Admin | http://localhost:5175 |
| API | http://localhost:3001 |

---

## Criando usuários

1. Supabase Dashboard → **Authentication → Users → Add user**
2. Crie o usuário com email e senha
3. SQL Editor:

```sql
-- Admin
INSERT INTO users (auth_id, full_name, email, user_type)
SELECT id, 'Nome', 'email@exemplo.com', 'admin'
FROM auth.users WHERE email = 'email@exemplo.com'
ON CONFLICT (email) DO UPDATE SET user_type = 'admin', auth_id = EXCLUDED.auth_id;

-- Operador (cooperativa)
INSERT INTO users (auth_id, full_name, email, user_type)
SELECT id, 'Nome', 'email@exemplo.com', 'operator'
FROM auth.users WHERE email = 'email@exemplo.com'
ON CONFLICT (email) DO UPDATE SET user_type = 'operator', auth_id = EXCLUDED.auth_id;
```

---

## Deploy

### API (Render)

Configurado via `render.yaml`. Variáveis obrigatórias no painel do Render:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NODE_ENV=production`
- `TURISTA_URL=https://sobrejeri.github.io`
- `COOP_URL=https://sobrejeri.github.io`
- `ADMIN_URL=https://sobrejeri.github.io`

### Frontend (GitHub Pages)

Push para `main` ou `claude/giro-jeri-platform-GFBFR` dispara o CI.

Secrets obrigatórios no repositório GitHub:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` → URL da API no Render

---

## Perfis de usuário

| Perfil | Acesso |
|--------|--------|
| `tourist` | App turista — reservas, pagamentos |
| `operator` | Dashboard cooperativa — operação, despacho, cotações |
| `admin` | Acesso total — catálogo, usuários, financeiro |

---

## Principais endpoints da API

```
GET    /health

POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
POST   /api/auth/refresh

GET    /api/regions
GET    /api/tours
GET    /api/tours/:id
GET    /api/transfers
GET    /api/vehicles

POST   /api/tours/:id/calculate
POST   /api/tours/:id/suggest-vehicles
POST   /api/transfers/calculate
POST   /api/transfers/quotes

POST   /api/bookings
GET    /api/bookings
GET    /api/bookings/:id
POST   /api/bookings/:id/cancel

GET    /api/catalog/tours          (operator+)
POST   /api/catalog/tours          (operator+)
PUT    /api/catalog/tours/:id      (operator+)
DELETE /api/catalog/tours/:id      (operator+)

GET    /api/admin/stats            (admin)
GET    /api/admin/users            (admin)
GET    /api/admin/financial        (admin)
GET    /api/admin/operational      (operator+)
```

---

## Roadmap

### Concluído
- [x] Schema completo (30+ tabelas) + RLS
- [x] API com motor de preços e cotações
- [x] App turista mobile-first com design de aplicativo
- [x] Dashboard cooperativa (kanban, cotações, veículos)
- [x] Dashboard administrativo (catálogo, usuários, financeiro)
- [x] Deploy automático GitHub Pages + Render
- [x] Auth via Supabase direto no frontend
- [x] Upload de imagens via Supabase Storage

### Próximo
- [ ] Integração Mercado Pago
- [ ] Notificações WhatsApp
- [ ] Programa de afiliados
- [ ] Multi-região
- [ ] App mobile nativo
