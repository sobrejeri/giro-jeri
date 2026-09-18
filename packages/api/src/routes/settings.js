// ── settings.js ────────────────────────────────────────
// Configurações públicas lidas pelo app do turista (sem autenticação).
import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

// Apenas chaves seguras para exposição pública.
// IMPORTANTE: nunca inclua a Secret Key (payment_gateway_api_key) nem o webhook
// secret. A chave pública do Pagar.me (pk_xxx) é feita para o navegador —
// tokeniza o cartão sem que o número passe pelo nosso servidor.
const PUBLIC_KEYS = [
  'home_banner_image_url',
  'home_banner_title',
  'home_banner_subtitle',
  'whatsapp_support_number',
  'app_version',
  'default_currency',
  'payment_gateway',
  'payment_gateway_public_key',
];

// ── GET /api/settings/public ───────────────────────────
router.get('/public', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', PUBLIC_KEYS);
    if (error) throw error;

    const map = Object.fromEntries((data || []).map((s) => [s.setting_key, s.setting_value]));
    res.json(map);
  } catch (err) { next(err); }
});

export default router;
