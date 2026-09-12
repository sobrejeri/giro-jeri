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
  // Perfil do Instagram no rodapé. Vazio = o app esconde o ícone, em vez de
  // mostrar um link para "#".
  'instagram_url',
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
  // Cartão restrito a quem tem conta no Mercado Pago. O app precisa saber para
  // dizer isso ANTES do clique, e para apontar o PIX a quem não tem conta —
  // descobrir a restrição já dentro da página deles é o pior lugar possível.
  'payment_mp_wallet_only',
  // Terceira opção de cartão: o formulário do Mercado Pago DENTRO do site, ao
  // lado dos botões que redirecionam. É o caminho de quem não tem conta no
  // Mercado Pago e por isso não consegue usar o Checkout Pro.
  'payment_card_form_inline',
];

// Chaves que decidem QUAIS botões de cartão o checkout mostra. Não vão na lista
// acima porque não são copiadas do banco: são calculadas — ver abaixo.
const CHAVES_CARTAO = ['payment_card_acquirers', 'payment_gateway_card', 'payment_gateway',
  'payment_pagarme_api_key'];

// ── GET /api/settings/public ───────────────────────────
router.get('/public', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [...PUBLIC_KEYS, ...CHAVES_CARTAO]);
    if (error) throw error;

    const todas = Object.fromEntries((data || []).map((s) => [s.setting_key, s.setting_value]));
    const map = Object.fromEntries(PUBLIC_KEYS.map((k) => [k, todas[k]])
      .filter(([, v]) => v !== undefined));

    // ── Quais botões de cartão o checkout pode mostrar ───────────────────
    // CALCULADO, e só com o que está REALMENTE PRONTO. A lista bruta diria
    // "Pagar.me" mesmo sem chave cadastrada, e o cliente clicaria num botão que
    // responde 503 — pior que não ter o botão. Aqui só sai o adquirente que
    // consegue cobrar agora.
    //
    // O SEGREDO NÃO SAI: vai um booleano derivado da existência da chave, nunca
    // a chave. Esta rota é pública e sem autenticação.
    const { acquirersDeCartao, chaveDoPagarme } = await import('./payments.js');
    const prontos = acquirersDeCartao(todas).filter((g) => {
      if (g === 'pagarme') return !!chaveDoPagarme(todas);
      if (g === 'asaas')   return false;   // sem integração
      return true;                          // mercado_pago: as credenciais já são exigidas no /intent
    });
    map.payment_card_acquirers = prontos.join(',');

    res.json(map);
  } catch (err) { next(err); }
});

export default router;
