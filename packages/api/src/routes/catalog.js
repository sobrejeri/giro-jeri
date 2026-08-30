/**
 * /api/catalog — CRUD de tours, transfers e rotas
 * GETs: qualquer operador/admin autenticado
 * POST/PUT/DELETE: somente admin
 */
import { Router } from 'express';
import { authenticate, requireOperator, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(requireOperator); // leitura: operador ou admin

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Seleciona apenas as chaves permitidas de um objeto. Usado para não enviar
// ao update/insert colunas inexistentes (ex.: o join `transfers` ou campos
// somente-leitura como id/created_at que o front reenvia ao editar).
function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

// Colunas graváveis de transfer_routes (migration 001)
const ROUTE_COLS = [
  'transfer_id', 'origin_name', 'destination_name',
  'origin_latitude', 'origin_longitude', 'destination_latitude', 'destination_longitude',
  'default_price', 'extra_stop_price', 'night_fee', 'is_active', 'is_featured',
  'cover_image_url',
]

// Colunas graváveis de transfers (serviço-pai)
const TRANSFER_COLS = [
  'service_window_start', 'service_window_end',
  'region_id', 'name', 'slug', 'short_description', 'pricing_mode',
  'is_active', 'display_order', 'booking_cutoff_time', 'min_advance_hours',
  'region_ids',
  // Faltava: sem isto o `pick` descartava o campo e a categoria era salva SEM
  // carrossel próprio, em silêncio — a caixa marcada no admin não virava nada.
  'is_exclusive',
  // Modal da categoria de translado (073): terrestre ou aéreo.
  'modal',
]

// Campos NÃO textuais de transfers. O formulário manda '' quando o campo fica
// em branco, e o Postgres recusa '' em TIME/INT/NUMERIC
// ("invalid input syntax for type time"). Texto vazio é inofensivo e continua
// passando; aqui só os tipados viram NULL, que é o que "em branco" significa.
const TRANSFER_NAO_TEXTO = [
  'service_window_start', 'service_window_end', 'booking_cutoff_time',
  'min_advance_hours', 'display_order', 'region_id',
]

function vaziosViramNulo(body, campos) {
  const out = { ...body }
  for (const c of campos) if (out[c] === '') out[c] = null
  return out
}

// ── Modais de operação ────────────────────────────────────
// Terrestre, aéreo, aquático… A lista era fixa no código (CHECK das migrations
// 073/074): cada modal novo exigia migration e deploy. Virou cadastro na
// migration 075, e as três colunas apontam para cá por chave estrangeira.

const MODAL_COLS = ['slug', 'name', 'description', 'is_active', 'sort_order',
  // Executor fixo e comissões (078). Sem estar aqui, o `pick` descartaria a
  // escolha do admin em silêncio — já aconteceu com `is_exclusive`.
  'executor_operator_id', 'acceptor_commission_pct', 'platform_commission_pct']

router.get('/modals', async (req, res, next) => {
  try {
    const montar = (colunas) => req.supabase
      .from('service_modals').select(colunas)
      .order('sort_order', { ascending: true })
      .order('name');

    // O join do executor só existe a partir da 078. Sem ela, a consulta com o
    // join falharia e o modal cairia no atalho dos três fixos lá embaixo —
    // sumindo com os modais que o dono cadastrou. Tenta com, cai para sem.
    let { data, error } = await montar('*, executor:executor_operator_id ( id, full_name )');
    if (error) {
      console.warn('[catalog] executor do modal indisponível (migration 078):', error.message);
      ({ data, error } = await montar('*'));
    }
    // Sem a 075 aplicada a tabela não existe. Devolve os três de sempre em vez
    // de 500 — o painel continua funcionando com a lista de antes.
    if (error) {
      console.warn('[catalog] service_modals indisponível (migration 075):', error.message);
      return res.json([
        { slug: 'terrestre', name: 'Terrestre', is_active: true, sort_order: 1 },
        { slug: 'aereo',     name: 'Aéreo',     is_active: true, sort_order: 2 },
        { slug: 'aquatico',  name: 'Aquático',  is_active: true, sort_order: 3 },
      ]);
    }
    res.json(data);
  } catch (err) { next(err); }
});

// Quantos registros apontam para um modal. Usado antes de desativar: some da
// lista sem avisar e o dono só descobriria pela frota sumindo de um serviço.
async function usoDoModal(supabase, slug) {
  const conta = async (tabela) => {
    const { count, error } = await supabase
      .from(tabela).select('id', { count: 'exact', head: true }).eq('modal', slug);
    return error ? 0 : (count || 0);
  };
  const [veiculos, passeios, translados] = await Promise.all([
    conta('vehicles'), conta('categories'), conta('transfers'),
  ]);
  return { veiculos, passeios, translados, total: veiculos + passeios + translados };
}

router.post('/modals', requireAdmin, async (req, res, next) => {
  try {
    const body = pick(req.body, MODAL_COLS);
    if (!body.name) return res.status(400).json({ error: 'Informe o nome do modal.' });
    // O slug é a chave que as outras tabelas guardam — gerado a partir do nome
    // e SEM sufixo aleatório, ao contrário de tours/categorias: aqui ele é
    // lido por gente ao conferir o banco, e um `aquatico-l3k9` não ajudaria.
    if (!body.slug) body.slug = slugify(body.name);
    if (!body.slug) return res.status(400).json({ error: 'Nome inválido para gerar o identificador.' });
    if (body.sort_order === '' || body.sort_order === undefined) body.sort_order = 99;

    const { data, error } = await req.supabase
      .from('service_modals').insert(body).select().single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Já existe um modal com este nome.' });
      if (error.code === '42P01') {
        return res.status(400).json({
          error: 'O banco ainda não tem a tabela de modais. Rode a migration 075_modais_cadastraveis.sql no Supabase.',
        });
      }
      if (error.code === '42501') {
        return res.status(400).json({
          error: 'O banco ainda não autoriza o admin a gravar modais. Rode a migration 075 no Supabase.',
        });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/modals/:id', requireAdmin, async (req, res, next) => {
  try {
    // `slug` fica FORA do update: é a chave que veículos e categorias guardam.
    // Trocá-la por aqui exigiria propagar (o banco até faz, via ON UPDATE
    // CASCADE) — mas renomear é o caso comum, e para isso basta `name`.
    const body = pick(req.body, MODAL_COLS.filter((c) => c !== 'slug'));
    if (body.sort_order === '') body.sort_order = 99;
    if (body.executor_operator_id === '') body.executor_operator_id = null;
    for (const c of ['acceptor_commission_pct', 'platform_commission_pct']) {
      if (body[c] === '' || body[c] === undefined) {
        if (c === 'acceptor_commission_pct' && body[c] === '') body[c] = 0;
        else if (body[c] === '') body[c] = null;
      }
    }
    // As duas comissões juntas passando de 100% deixariam o executor com valor
    // NEGATIVO, e o Mercado Pago recusa o pagamento inteiro. O banco também
    // barra (CHECK da 078), mas aqui a mensagem diz o que fazer.
    const somaPct = (Number(body.acceptor_commission_pct) || 0)
                  + (Number(body.platform_commission_pct) || 0);
    if (somaPct > 100) {
      return res.status(400).json({
        error: `As comissões somam ${somaPct}% — passam de 100% e deixariam o executor com valor negativo.`,
      });
    }

    // Desativar um modal em uso esconde a opção e deixa registros apontando
    // para algo que sumiu da tela. Melhor recusar dizendo quem usa.
    if (body.is_active === false) {
      const { data: atual } = await req.supabase
        .from('service_modals').select('slug').eq('id', req.params.id).maybeSingle();
      if (atual?.slug) {
        const uso = await usoDoModal(req.supabase, atual.slug);
        if (uso.total > 0) {
          return res.status(400).json({
            error: `Este modal está em uso: ${uso.veiculos} veículo(s), `
                 + `${uso.passeios} categoria(s) de passeio e ${uso.translados} de translado. `
                 + 'Mude esses cadastros de modal antes de desativar.',
          });
        }
      }
    }

    const { data, error } = await req.supabase
      .from('service_modals').update(body).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Modal não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/modals/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data: atual } = await req.supabase
      .from('service_modals').select('slug').eq('id', req.params.id).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Modal não encontrado' });

    const uso = await usoDoModal(req.supabase, atual.slug);
    if (uso.total > 0) {
      return res.status(400).json({
        error: `Não dá para remover: ${uso.veiculos} veículo(s), ${uso.passeios} categoria(s) `
             + `de passeio e ${uso.translados} de translado usam este modal.`,
      });
    }

    const { error } = await req.supabase
      .from('service_modals').delete().eq('id', req.params.id);
    // A FK é RESTRICT: mesmo que a contagem acima erre por RLS, o banco barra.
    if (error?.code === '23503') {
      return res.status(400).json({ error: 'Este modal está em uso e não pode ser removido.' });
    }
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Categorias ────────────────────────────────────────────

const CATEGORY_COLS = ['name', 'slug', 'description', 'icon', 'color',
  'category_type', 'is_active', 'sort_order', 'is_exclusive', 'modal']

router.get('/categories', async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('categories').select('*')
      .order('sort_order', { ascending: true })
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// ── CRUD de categorias (só admin) ──────────────────────────
// Antes só existia o GET: dava para LIGAR um passeio a uma categoria, mas não
// para criar categoria alguma pelo painel — a lista vinha do seed e ficava
// congelada.

// RLS: `categories` só ganhou policy de escrita na migration 072 (a 034 criou a
// dos outros catálogos e esqueceu esta). Sem ela, o Postgres devolve 42501 e o
// painel mostrava "new row violates row-level security policy" — mensagem que
// não diz a quem lê o que fazer. Traduzida para o que resolve.
function erroDeCategoria(error) {
  if (error?.code === '42501' || /row-level security/i.test(error?.message || '')) {
    return 'O banco ainda não autoriza o admin a gravar categorias. '
         + 'Rode a migration 072_categories_admin_write_rls.sql no Supabase.';
  }
  if (error?.code === '23505') return 'Já existe uma categoria com este nome.';
  return null;
}
router.post('/categories', requireAdmin, async (req, res, next) => {
  try {
    const body = pick(req.body, CATEGORY_COLS);
    if (!body.name) return res.status(400).json({ error: 'Informe o nome da categoria.' });
    // slug é NOT NULL e UNIQUE; o formulário não pede — mesmo tratamento dos
    // tours e transfers. O sufixo evita colisão com categoria de nome parecido.
    if (!body.slug) body.slug = `${slugify(body.name)}-${Date.now().toString(36)}`;
    if (!body.category_type) body.category_type = 'tour';
    if (body.sort_order === '' || body.sort_order === undefined) body.sort_order = 0;

    let { data, error } = await req.supabase
      .from('categories').insert(body).select().single();
    // `is_exclusive` só existe a partir da migration 071. Sem ela aplicada, o
    // insert inteiro morria em 42703 e não dava para criar categoria nenhuma —
    // melhor salvar sem a marca de carrossel do que recusar o cadastro.
    if (error?.code === '42703') {
      console.warn('[catalog] categories.is_exclusive ausente (migration 071):', error.message);
      const { is_exclusive: _ie, ...semMarca } = body;
      ({ data, error } = await req.supabase
        .from('categories').insert(semMarca).select().single());
    }
    if (error) {
      const amigavel = erroDeCategoria(error);
      if (amigavel) return res.status(400).json({ error: amigavel });
      throw error;
    }
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/categories/:id', requireAdmin, async (req, res, next) => {
  try {
    const body = pick(req.body, CATEGORY_COLS);
    if (body.sort_order === '') body.sort_order = 0;
    let { data, error } = await req.supabase
      .from('categories').update(body).eq('id', req.params.id).select().single();
    if (error?.code === '42703') {
      console.warn('[catalog] categories.is_exclusive ausente (migration 071):', error.message);
      const { is_exclusive: _ie, ...semMarca } = body;
      ({ data, error } = await req.supabase
        .from('categories').update(semMarca).eq('id', req.params.id).select().single());
    }
    const amigavel = erroDeCategoria(error);
    if (amigavel) return res.status(400).json({ error: amigavel });
    if (error || !data) return res.status(404).json({ error: 'Categoria não encontrada' });
    res.json(data);
  } catch (err) { next(err); }
});

// Desativa em vez de apagar: passeios apontam para a categoria
// (`tours.category_id`), e remover a linha deixaria o vínculo pendurado.
// Categoria com passeios não pode sumir em silêncio: `tours.category_id` tem
// ON DELETE SET NULL, então o banco aceitaria — e os passeios cairiam todos em
// "Sem categoria" sem ninguém perceber, quebrando o carrossel da vitrine.
router.delete('/categories/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data: categoria } = await req.supabase
      .from('categories').select('id, name').eq('id', id).maybeSingle();
    if (!categoria) return res.status(404).json({ error: 'Categoria não encontrada' });

    const { count } = await req.supabase
      .from('tours').select('id', { count: 'exact', head: true }).eq('category_id', id);

    if ((count || 0) > 0) {
      return res.status(409).json({
        error: `"${categoria.name}" tem ${count} passeio(s). Apagá-la jogaria todos em "Sem categoria" `
             + 'e o carrossel dela sumiria da vitrine. Mova os passeios para outra categoria antes, ou desative esta.',
      });
    }

    const { error } = await req.supabase.from('categories').delete().eq('id', id);
    if (error) {
      const amigavel = erroDeCategoria(error);
      if (amigavel) return res.status(400).json({ error: amigavel });
      if (error.code === '23503') {
        return res.status(409).json({ error: 'Esta categoria está em uso. Desative-a em vez de apagar.' });
      }
      throw error;
    }
    res.json({ ok: true, apagado: categoria.name });
  } catch (err) { next(err); }
});

// ── Tours ─────────────────────────────────────────────────

// Categorias de um passeio. O admin manda `category_ids`; versões antigas da
// tela (e integrações) mandam só `category_id`. A primeira do array é a
// PRINCIPAL e vai também para `category_id`, que continua existindo para quem
// só sabe ler uma categoria.
function normalizarCategorias({ category_ids, category_id }) {
  const lista = Array.isArray(category_ids)
    ? category_ids.filter(Boolean)
    : (category_id ? [category_id] : [])
  const unicos = [...new Set(lista)]
  return { category_ids: unicos, category_id: unicos[0] || null }
}

router.get('/tours', async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('tours')
      .select('*, categories(id, name, slug)')
      .order('display_order', { ascending: true })
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/tours', requireAdmin, async (req, res, next) => {
  try {
    const { data: region } = await req.supabase
      .from('regions').select('id').limit(1).single();

    const {
      name, short_description, duration_hours, max_people,
      is_private_enabled, is_shared_enabled, shared_price_per_person,
      cover_image_url, category_id, category_ids, region_ids, is_featured, display_order,
      booking_cutoff_time, min_advance_hours, is_exclusive,
      service_window_start, service_window_end,
    } = req.body;

    const slug = `${slugify(name)}-${Date.now().toString(36)}`;

    const linha = {
      region_id:               region.id,
      name,
      slug,
      short_description:       short_description || null,
      duration_hours:          duration_hours   ? Number(duration_hours)   : null,
      max_people:              max_people       ? Number(max_people)       : null,
      is_private_enabled:      is_private_enabled !== false,
      is_shared_enabled:       !!is_shared_enabled,
      shared_price_per_person: shared_price_per_person ? Number(shared_price_per_person) : null,
      cover_image_url:         cover_image_url  || null,
      ...normalizarCategorias({ category_ids, category_id }),
      region_ids:              Array.isArray(region_ids) ? region_ids : [],
      is_featured:             !!is_featured,
      display_order:           display_order ? Number(display_order) : 0,
      booking_cutoff_time:     booking_cutoff_time || null,
      min_advance_hours:       min_advance_hours ? Number(min_advance_hours) : null,
      is_exclusive:            !!is_exclusive,
      service_window_start:    service_window_start || null,
      service_window_end:      service_window_end   || null,
    };
    const { data, error } = await req.supabase.from('tours').insert(linha).select().single();

    // Banco ainda sem a migration 083: insere sem o array e mantém a categoria
    // única. Melhor um passeio com uma categoria do que erro ao cadastrar.
    if (error?.code === '42703') {
      const { category_ids: _drop, ...semArray } = linha;
      const retry = await req.supabase.from('tours').insert(semArray).select().single();
      if (retry.error) throw retry.error;
      return res.status(201).json(retry.data);
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/tours/:id', requireAdmin, async (req, res, next) => {
  try {
    const {
      name, short_description, duration_hours, max_people,
      is_private_enabled, is_shared_enabled, shared_price_per_person,
      cover_image_url, category_id, category_ids, is_active, display_order, is_featured,
      latitude, longitude, service_radius_km, region_ids,
      booking_cutoff_time, min_advance_hours, is_exclusive,
      service_window_start, service_window_end,
    } = req.body;

    const update = {};
    if (booking_cutoff_time !== undefined) update.booking_cutoff_time = booking_cutoff_time || null;
    if (min_advance_hours   !== undefined) update.min_advance_hours   = min_advance_hours ? Number(min_advance_hours) : null;
    if (is_exclusive        !== undefined) update.is_exclusive        = !!is_exclusive;
    if (service_window_start !== undefined) update.service_window_start = service_window_start || null;
    if (service_window_end   !== undefined) update.service_window_end   = service_window_end   || null;
    if (name               !== undefined) update.name                    = name;
    if (short_description  !== undefined) update.short_description       = short_description;
    if (duration_hours     !== undefined) update.duration_hours          = duration_hours ? Number(duration_hours) : null;
    if (max_people         !== undefined) update.max_people              = max_people ? Number(max_people) : null;
    if (is_private_enabled !== undefined) update.is_private_enabled      = is_private_enabled;
    if (is_shared_enabled  !== undefined) update.is_shared_enabled       = is_shared_enabled;
    if (shared_price_per_person !== undefined) update.shared_price_per_person = shared_price_per_person ? Number(shared_price_per_person) : null;
    if (cover_image_url    !== undefined) update.cover_image_url         = cover_image_url;
    // As duas colunas andam juntas: gravar só uma deixaria o passeio numa
    // categoria pela vitrine e em outra pelo rótulo.
    if (category_ids !== undefined || category_id !== undefined) {
      Object.assign(update, normalizarCategorias({ category_ids, category_id }));
    }
    if (is_active          !== undefined) update.is_active               = is_active;
    if (is_featured        !== undefined) update.is_featured             = is_featured;
    if (display_order      !== undefined) update.display_order           = Number(display_order) || 0;
    if (latitude           !== undefined) update.latitude                = latitude === '' || latitude === null ? null : Number(latitude);
    if (longitude          !== undefined) update.longitude               = longitude === '' || longitude === null ? null : Number(longitude);
    if (service_radius_km  !== undefined) update.service_radius_km       = service_radius_km === '' || service_radius_km === null ? null : Number(service_radius_km);
    if (region_ids         !== undefined) update.region_ids              = Array.isArray(region_ids) ? region_ids : [];

    let { data, error } = await req.supabase
      .from('tours').update(update).eq('id', req.params.id).select().single();
    if (error?.code === '42703' && update.category_ids !== undefined) {
      const { category_ids: _drop, ...semArray } = update;
      ({ data, error } = await req.supabase
        .from('tours').update(semArray).eq('id', req.params.id).select().single());
    }
    if (error || !data) return res.status(404).json({ error: 'Passeio não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

// Apaga de verdade — antes isto só gravava `is_active = false` e devolvia 204,
// então a tela dizia "apagado" e o passeio continuava lá, inativo. Quem queria
// só desativar já tem o botão de desativar; quem clica em apagar espera sumir.
//
// `bookings.service_id` e `reviews.service_id` NÃO têm chave estrangeira (a
// coluna aponta para tours OU transfer_routes conforme o tipo). Ou seja: o
// banco não impede nada aqui. Sem esta checagem, apagar um passeio vendido
// deixaria reservas apontando para um serviço inexistente — a lista de reservas
// passaria a mostrar linhas sem nome e o histórico ficaria impossível de
// auditar.
router.delete('/tours/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;

    const { data: passeio } = await req.supabase
      .from('tours').select('id, name').eq('id', id).maybeSingle();
    if (!passeio) return res.status(404).json({ error: 'Passeio não encontrado' });

    const contar = async (tabela) => {
      const { count, error } = await req.supabase
        .from(tabela).select('id', { count: 'exact', head: true })
        .eq('service_type', 'tour').eq('service_id', id);
      return error ? 0 : (count || 0);
    };
    const [reservas, avaliacoes] = await Promise.all([contar('bookings'), contar('reviews')]);

    if (reservas > 0 || avaliacoes > 0) {
      const partes = [];
      if (reservas > 0)   partes.push(`${reservas} reserva(s)`);
      if (avaliacoes > 0) partes.push(`${avaliacoes} avaliação(ões)`);
      return res.status(409).json({
        error: `"${passeio.name}" tem ${partes.join(' e ')} e não pode ser apagado — o histórico `
             + 'ficaria sem referência. Desative-o: some da vitrine e das buscas, e os registros continuam válidos.',
        reservas, avaliacoes,
      });
    }

    // Sem FK, estes não somem sozinhos. `tour_schedules` some (tem CASCADE).
    await req.supabase.from('services_availability')
      .delete().eq('service_type', 'tour').eq('service_id', id);

    const { error } = await req.supabase.from('tours').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({
          error: 'Este passeio está vinculado a outros registros. Desative-o em vez de apagar.',
        });
      }
      throw error;
    }
    res.json({ ok: true, apagado: passeio.name });
  } catch (err) { next(err); }
});

// ── Transfers (serviços) ──────────────────────────────────

router.get('/transfers', async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('transfers')
      .select('id, name, is_active, short_description, pricing_mode, display_order, booking_cutoff_time, min_advance_hours, region_id, region_ids')
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/transfers', requireAdmin, async (req, res, next) => {
  try {
    const body = vaziosViramNulo(pick(req.body, TRANSFER_COLS), TRANSFER_NAO_TEXTO);
    // slug e region_id são NOT NULL no banco, mas o formulário não os envia —
    // mesmo tratamento do POST de tours (sem isto o INSERT falhava e o modal
    // 'não salvava' em silêncio).
    if (!body.name) return res.status(400).json({ error: 'Informe o nome do transfer.' });
    if (!body.slug) body.slug = `${slugify(body.name)}-${Date.now().toString(36)}`;
    if (!body.region_id) {
      const { data: region } = await req.supabase
        .from('regions').select('id').limit(1).single();
      if (!region) return res.status(400).json({ error: 'Nenhuma região cadastrada — crie uma região antes.' });
      body.region_id = Array.isArray(body.region_ids) && body.region_ids[0]
        ? body.region_ids[0] : region.id;
    }
    if (body.region_ids !== undefined && !Array.isArray(body.region_ids)) body.region_ids = [];
    const { data, error } = await req.supabase
      .from('transfers').insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/transfers/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('transfers')
      .update(vaziosViramNulo(pick(req.body, TRANSFER_COLS), TRANSFER_NAO_TEXTO))
      .eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Transfer não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

// Apagar um transfer CASCATEIA as rotas dele (`transfer_routes.transfer_id`
// tem ON DELETE CASCADE). Então a checagem tem que olhar as reservas de TODAS
// as rotas — não as do transfer, que não existem: a reserva aponta para a rota.
router.delete('/transfers/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data: transfer } = await req.supabase
      .from('transfers').select('id, name').eq('id', id).maybeSingle();
    if (!transfer) return res.status(404).json({ error: 'Transfer não encontrado' });

    const { data: rotas } = await req.supabase
      .from('transfer_routes').select('id').eq('transfer_id', id);
    const idsRota = (rotas || []).map((r) => r.id);

    let reservas = 0;
    if (idsRota.length > 0) {
      const { count } = await req.supabase
        .from('bookings').select('id', { count: 'exact', head: true })
        .eq('service_type', 'transfer').in('service_id', idsRota);
      reservas = count || 0;
    }

    if (reservas > 0) {
      return res.status(409).json({
        error: `"${transfer.name}" tem ${reservas} reserva(s) nas suas rotas e não pode ser apagado — `
             + 'apagá-lo levaria as rotas junto e deixaria o histórico sem referência. Desative-o.',
      });
    }

    const { error } = await req.supabase.from('transfers').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({ error: 'Este transfer está vinculado a outros registros. Desative-o em vez de apagar.' });
      }
      throw error;
    }
    res.json({ ok: true, apagado: transfer.name, rotas_removidas: idsRota.length });
  } catch (err) { next(err); }
});

// ── Rotas de Transfer ─────────────────────────────────────

router.get('/transfer-routes', async (req, res, next) => {
  try {
    const { transfer_id } = req.query;
    let query = req.supabase
      .from('transfer_routes').select('*, transfers(id, name, booking_cutoff_time)').order('origin_name');
    if (transfer_id) query = query.eq('transfer_id', transfer_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/transfer-routes', requireAdmin, async (req, res, next) => {
  try {
    const body = pick(req.body, ROUTE_COLS);
    if (body.default_price != null) body.default_price = Number(body.default_price);
    const { data, error } = await req.supabase
      .from('transfer_routes').insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/transfer-routes/:id', requireAdmin, async (req, res, next) => {
  try {
    const body = pick(req.body, ROUTE_COLS);
    if (body.default_price != null) body.default_price = Number(body.default_price);
    const { data, error } = await req.supabase
      .from('transfer_routes').update(body).eq('id', req.params.id).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data)  return res.status(404).json({ error: 'Rota não encontrada' });
    res.json(data);
  } catch (err) { next(err); }
});

// A ROTA é o que a reserva de translado referencia em `service_id` — e sem FK,
// como no passeio. Apagar uma rota vendida deixaria reservas órfãs.
router.delete('/transfer-routes/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data: rota } = await req.supabase
      .from('transfer_routes').select('id, origin_name, destination_name').eq('id', id).maybeSingle();
    if (!rota) return res.status(404).json({ error: 'Rota não encontrada' });

    const { count } = await req.supabase
      .from('bookings').select('id', { count: 'exact', head: true })
      .eq('service_type', 'transfer').eq('service_id', id);

    if ((count || 0) > 0) {
      return res.status(409).json({
        error: `A rota ${rota.origin_name} → ${rota.destination_name} tem ${count} reserva(s) e não pode `
             + 'ser apagada — o histórico ficaria sem referência. Desative-a: some da vitrine e os registros continuam válidos.',
      });
    }

    const { error } = await req.supabase.from('transfer_routes').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({ error: 'Esta rota está vinculada a outros registros. Desative-a em vez de apagar.' });
      }
      throw error;
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
