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
// Cobre passeios (tours) e rotas de translado (transfer_routes). Translado não
// tem página de detalhe por rota, então o link do item aponta para a aba de
// translados; o preço é o default_price da rota.

import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

const TURISTA_APP = (process.env.TURISTA_APP_URL || 'https://sobrejeri.github.io/giro-jeri').replace(/\/$/, '');

// Primeiro preço candidato > 0. Sem nenhum → null, e o item não entra no feed
// (a Meta/Google rejeitam item sem preço).
function precoPositivo(...candidatos) {
  for (const c of candidatos) { const v = Number(c); if (v > 0) return v; }
  return null;
}

// Texto limpo para a coluna description: sem HTML, sem quebra de linha, cortado.
function textoLimpo(s, max = 4000) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Passeios ativos com preço E imagem de capa (requisito da Meta/Google).
async function itensDeTours() {
  const { data, error } = await supabase
    .from('tours')
    .select('id, name, short_description, full_description, cover_image_url, from_price, shared_price_per_person, base_price, is_active, categories(name)')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;

  const itens = [];
  for (const t of data || []) {
    const preco = precoPositivo(t.from_price, t.shared_price_per_person, t.base_price);
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

// Rotas de translado ativas (de um translado também ativo) com preço E imagem.
// Sem página de detalhe por rota, o link aponta para a aba de translados.
async function itensDeTransfers() {
  const { data, error } = await supabase
    .from('transfer_routes')
    .select('id, origin_name, destination_name, default_price, cover_image_url, is_active, transfers(name, short_description, full_description, base_price, is_active)')
    .eq('is_active', true)
    .order('origin_name');
  if (error) throw error;

  const itens = [];
  for (const r of data || []) {
    if (r.transfers?.is_active === false) continue;   // translado pai desativado
    const preco = precoPositivo(r.default_price, r.transfers?.base_price);
    const img   = r.cover_image_url;
    if (!preco || !img) continue;   // sem preço ou sem imagem → fora do feed
    const rota = [r.origin_name, r.destination_name].filter(Boolean).join(' → ');
    const nome = r.transfers?.name ? `${r.transfers.name} · ${rota}` : `Transfer ${rota}`;
    itens.push({
      id:           r.id,
      title:        textoLimpo(nome, 150) || 'Transfer',
      description:  textoLimpo(r.transfers?.short_description || r.transfers?.full_description || rota),
      availability: 'in stock',
      condition:    'new',
      price:        `${preco.toFixed(2)} BRL`,
      link:         `${TURISTA_APP}/transfers`,
      image_link:   img,
      brand:        'Turiva',
      product_type: 'Transfers',
    });
  }
  return itens;
}

// Catálogo completo: passeios + translados. Resiliente — se uma parte falhar,
// a outra ainda é servida (o feed é consumido por crawler externo, não derruba).
async function itensDoCatalogo() {
  const r = await Promise.allSettled([itensDeTours(), itensDeTransfers()]);
  const itens = [];
  for (const parte of r) {
    if (parte.status === 'fulfilled') itens.push(...parte.value);
    else console.error('[marketing feed] parte do catálogo falhou (ignorada):', parte.reason?.message);
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
