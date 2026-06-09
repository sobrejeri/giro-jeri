// ── settings.js ────────────────────────────────────────
// Configurações públicas lidas pelo app do turista (sem autenticação).
import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

// Apenas chaves seguras para exposição pública.
const PUBLIC_KEYS = [
  'home_banner_image_url',
  'home_banner_title',
  'home_banner_subtitle',
  'whatsapp_support_number',
  'app_version',
  'default_currency',
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
