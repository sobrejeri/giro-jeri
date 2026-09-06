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
  // Fotos de fundo dos quadros "Descubra" da home. Vazio = a home cai no
  // degradê, então dá para publicar sem imagem nenhuma e ir trocando depois.
  'descubra_restaurantes_image_url',
  'descubra_eventos_image_url',
  'descubra_lugares_image_url',
  'descubra_dicas_image_url',
  // Formas de pagamento que o checkout oferece. São só chaves de exibição —
  // a chave da API e o segredo do webhook NUNCA entram aqui.
  'payment_method_pix',
  'payment_method_credit',
  'payment_method_debit',
  'payment_max_installments',
  // 'bricks' (cartão digitado no site) ou 'checkout_pro' (cliente vai para a
  // página do Mercado Pago). O app precisa saber para decidir se mostra o
  // formulário de cartão ou um botão que redireciona.
  'payment_card_flow',
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
