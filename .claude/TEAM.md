# TEAM.md — Convenções do Time de Agentes (Giro Jeri / Zarpe)

> **Todo agente deve ler este arquivo no início de cada tarefa.** Ele define as regras
> invioláveis do projeto, o mapa de propriedade e as referências canônicas. Em caso de
> dúvida ou conflito com instruções genéricas, **estas regras prevalecem**.

## 1. Stack e regras invioláveis

- **JavaScript puro — NÃO use TypeScript.** Nada de `.ts`/`.tsx`, anotações de tipo ou
  `tsconfig`. O projeto é ESM (`"type": "module"`): use `import`/`export`, não `require`.
- **Backend**: Express 4 em `packages/api` (Node 20+). Rotas estilo Express, validação com
  **Zod**, segurança com Helmet/CORS/rate-limit já configurados em `src/index.js`.
- **Frontends**: React 18 + Vite + **JSX** (3 SPAs: `turista`, `admin`, `cooperativa`).
  - Data-fetching **sempre** via **TanStack Query** (`useQuery`/`useMutation`). Não criar
    `fetch` solto em componentes — usar o cliente em `lib/api.js`.
  - Estado compartilhado via **Context API** (ex.: `AuthContext`, `RegionContext`). Sem Redux.
  - **Estilo: Tailwind CSS apenas.** Proibido CSS modules, styled-components ou CSS global novo.
    Respeitar o tema (`brand` laranja `#FF6A00`, `ocean`, `sand`; fontes `Plus Jakarta Sans`/`Syne`).
  - **i18n obrigatório**: todo texto visível usa `react-i18next` (`const { t } = useTranslation()`).
    Toda chave nova entra nos três locales: `pt.json`, `en.json`, `es.json`.
  - Ícones: **lucide-react**. Datas: **date-fns**/**dayjs**. Não adicionar libs equivalentes.
- **Banco**: Supabase (Postgres + Auth + Storage). Auth por JWT validado no middleware da API.
- **Mobile-first**: layouts começam no mobile; breakpoints Tailwind (`sm/md/lg/xl`) para subir.
- **Antes de adicionar dependência**: justifique. Preferir o que já existe no `package.json`.

## 2. Migrations Supabase

- Local: `supabase/migrations/`, nomeadas `NNN_descricao.sql` (sequencial, kebab-case).
- A próxima migration é `max(NNN) + 1` — confira os arquivos existentes antes de numerar.
- **Nunca edite uma migration já existente/aplicada.** Mudança = nova migration.
- Toda alteração de schema deve: preservar RLS, considerar índices, e vir com um script de
  verificação (em `supabase/scripts/`) ou um SQL de checagem no fim do arquivo.
- Enums e tabelas centrais (`bookings`, `payments`, `tours`, `transfers`, etc.) são sensíveis —
  alterações nelas passam pelo Arquiteto/DBA antes de implementar.

## 3. Mapa de propriedade (quem mexe em quê)

| Área | Caminho | Dono principal |
|---|---|---|
| API / backend | `packages/api/src` | Engenheiro Senior |
| SPA turista/admin/cooperativa | `packages/{turista,admin,cooperativa}/src` | Frontend Expert |
| Banco / migrations / seeds | `supabase/` | DBA |
| Contratos de API, decisões cross-package | (transversal) | Arquiteto |
| Specs, critérios de aceite | (docs) | Product Owner |
| Fluxos, acessibilidade, copy de UI | (specs de UX) | UX Expert |
| Coordenação e review final | (transversal) | Tech Lead |

Não invada a área de outro papel sem handoff. PO e UX **especificam**, não escrevem lógica.
Frontend **não** cria migrations; DBA **não** escreve componentes React.

## 4. Referências canônicas (leia antes de assumir)

- **Schema completo / inventário**: `docs/BUBBLE_BLUEPRINT.md`.
- **Motor de preço**: `packages/api/src/services/priceEngine.js` (base + temporada + cupom).
- **Auth e papéis** (`requireAdmin`, `requireOperator`...): `packages/api/src/middleware/auth.js`.
- **Cliente HTTP do frontend** (axios + interceptors + auth header): `packages/turista/src/lib/api.js`.
- **Setup/portas/deploy**: `README.md`, `LANCAMENTO.md`, `render.yaml`,
  `.github/workflows/deploy-turista.yml`. Portas dev: turista 5173, cooperativa 5174, admin 5175,
  API 3001.

## 5. Verificação (não há testes nem lint hoje)

- Não existe framework de teste, ESLint ou Prettier. A verificação é **manual**:
  - Subir o dev server relevante (`npm run dev:api`, `dev:turista`, `dev:admin`, `dev:coop`, ou
    `dev:all`) e validar comportamento — de preferência pelos tools de **preview** (MCP), não
    pedindo ao usuário para checar.
  - Mudança de schema: rodar o script de verificação do DBA contra o banco.
- Ao terminar, relate honestamente: o que foi verificado, o que ficou pendente, e como reproduzir.

## 6. Protocolo de colaboração (handoff)

Todo agente **encerra sua resposta** com este bloco padronizado, que alimenta a discussão do time:

```
### Decisões
- <o que foi decidido e por quê>

### Riscos / Objeções
- <riscos, dívidas técnicas, pontos onde discordo de outro papel>

### Handoff
- Para <papel>: <o que ele precisa saber/fazer a seguir>
```

Quando você discordar de uma decisão de outro papel, **registre a objeção explicitamente** em
"Riscos / Objeções" em vez de silenciosamente seguir — é o Tech Lead quem concilia divergências.
