// ── partner.js ─────────────────────────────────────────
// Link direto por operador (/c/<slug> no app do turista). Leitura PÚBLICA
// do mínimo necessário para o selo "Reservando com X" — nunca expõe telefone,
// e-mail ou dados de recebimento. A atribuição real acontece no servidor, em
// /payments/request e /payments/cart-request (resolvendo o slug de novo lá).
import { Router } from 'express';
import { supabase } from '../supabase.js';

export const partnerRouter = Router();

// Resolve um slug para os dados públicos do operador ativo.
export async function resolvePartner(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const { data } = await supabase
    .from('users')
    .select('id, full_name, profile_photo_url, partner_slug')
    .eq('partner_slug', slug.toLowerCase().trim())
    .eq('user_type', 'operator')
    .eq('is_active', true)
    .maybeSingle();
  return data || null;
}

partnerRouter.get('/:slug', async (req, res, next) => {
  try {
    const p = await resolvePartner(req.params.slug);
    if (!p) return res.status(404).json({ error: 'Link de operador não encontrado' });
    res.json({ slug: p.partner_slug, name: p.full_name, photo: p.profile_photo_url || null });
  } catch (err) { next(err); }
});
