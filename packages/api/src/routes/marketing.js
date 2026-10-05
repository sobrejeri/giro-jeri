// ── marketing.js ───────────────────────────────────────
// Feed de catálogo PÚBLICO dos passeios, no formato que a Meta (Commerce
// Manager) e o Google (Merchant Center) consomem para anúncios dinâmicos
// (Advantage+ catalog / retargeting). A Meta/Google buscam esta URL sozinhas,
// de tempos em tempos, então não precisa de autenticação — só dados já
// públicos (passeios ativos).
//
// O `id` de cada item é o UUID do passeio — o MESMO que o Pixel manda em
// `content_ids` no ViewContent/Purchase. É esse casamento que liga "quem olhou
// o passeio X no site" ao "anúncio do passeio X no Instagram".
//
// Observação honesta: o Instagram Shopping ORGÂNICO (etiqueta de preço no post)
// exige produto físico e costuma barrar serviços/experiências. Este feed serve
// principalmente aos ANÚNCIOS dinâmicos, que aceitam catálogo de serviços.
//
// V1 cobre passeios (tours). Transfers entram depois (preço é por rota/veículo).

import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

const TURISTA_APP = (process.env.TURISTA_APP_URL || 'https://sobrejeri.github.io/giro-jeri').replace(/\/$/, '');

// Preço de exibição do passeio (mesma fonte da Lojinha: from_price; cai para o
// por-pessoa do compartilhado e, por fim, base_price). Sem preço > 0 → o item
// não entra no feed (a Meta/Google rejeitam item sem preço).
function precoDoTour(t) {
  const v = Number(t.from_price) || Number(t.shared_price_per_person) || Number(t.base_price) || 0;
  return v > 0 ? v : null;
}

// Texto limpo para a coluna description: sem HTML, sem quebra de linha, cortado.
function textoLimpo(s, max = 4000) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Monta os itens do catálogo a partir dos passeios ativos. Só entram os que têm
// preço E imagem de capa (requisito da Meta/Google — item sem imagem é rejeitado).
async function itensDoCatalogo() {
  const { data, error } = await supabase
    .from('tours')
    .select('id, name, short_description, full_description, cover_image_url, from_price, shared_price_per_person, base_price, is_active, categories(name)')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;

  const itens = [];
  for (const t of data || []) {
    const preco = precoDoTour(t);
    const img   = t.cover_image_url;
    if (!preco || !img) continue;   // sem preço ou sem imagem → fora do feed
    itens.push({
      id:           t.id,
      title:        textoLimpo(t.name, 150) || 'Passeio',
      description:  textoLimpo(t.short_description || t.full_description || t.name),
      availability: 'in stock',
      condition:    'new',
      price:        `${preco.toFixed(2)} BRL`,
      link:         `${TURISTA_APP}/passeios/${t.id}`,
      image_link:   img,
      brand:        'Turiva',
      product_type: textoLimpo(t.categories?.name || 'Passeios', 100),
    });
  }
  return itens;
}

const COLUNAS = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'product_type'];

// Escapa um valor para CSV: aspas ao redor quando há vírgula/aspas/quebra, e
// duplica aspas internas. Sem isso, uma vírgula no título desalinha a linha.
function celula(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── GET /api/marketing/catalog.csv ─────────────────────
// Feed CSV para colar no Commerce Manager (Meta) / Merchant Center (Google).
router.get('/catalog.csv', async (_req, res, next) => {
  try {
    const itens = await itensDoCatalogo();
    const linhas = [COLUNAS.join(',')];
    for (const it of itens) linhas.push(COLUNAS.map((c) => celula(it[c])).join(','));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');   // Meta/Google buscam de hora em hora
    res.set('Content-Disposition', 'inline; filename="turiva-catalog.csv"');
    res.send(linhas.join('\n'));
  } catch (err) { next(err); }
});

// ── GET /api/marketing/catalog.json ────────────────────
// Mesma fonte, em JSON — usado pelo admin para prévia e contagem de itens.
router.get('/catalog.json', async (_req, res, next) => {
  try {
    const items = await itensDoCatalogo();
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ count: items.length, items });
  } catch (err) { next(err); }
});

export default router;
