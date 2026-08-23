// ── broadcast.js ────────────────────────────────────────
// Rotas públicas ligadas às ofertas enviadas por WhatsApp:
//   · ver a oferta que chegou no link;
//   · aceitar a oferta;
//   · sair da lista de ofertas.
//
// Tudo aqui abre SEM login: quem recebe a mensagem pode nem estar logado no
// aparelho, e exigir senha para parar de receber mensagem é o atrito que faz a
// pessoa denunciar o número em vez de se descadastrar.
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate } from '../middleware/auth.js';
import { verifyOptOutToken } from '../lib/optOutToken.js';

const router = Router();

// ── GET /api/broadcast/offer/:code ─────────────────────
// Dados de exibição da oferta. Só o que já vai escrito na mensagem do
// WhatsApp — nada de limites de uso ou de quem já resgatou.
router.get('/offer/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Código ausente' });

    const { data, error } = await supabase
      .from('coupons')
      .select('code, title, description, discount_type, discount_value, min_order_amount, valid_until, is_active')
      .ilike('code', code)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.is_active) {
      return res.status(404).json({ error: 'Esta oferta não está mais disponível.' });
    }
    if (data.valid_until && new Date(data.valid_until) < new Date()) {
      return res.status(410).json({ error: 'Esta oferta expirou.' });
    }
    res.json(data);
  } catch (err) { next(err); }
});

// ── POST /api/broadcast/accept ─────────────────────────
// Marca que o cliente aceitou a oferta. Exige login porque só faz sentido
// registrar aceite de alguém identificado — o app chama isto de forma
// best-effort e ignora a falha: guardar o cupom no aparelho já funcionou.
router.post('/accept', authenticate, async (req, res, next) => {
  try {
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Código ausente' });

    const { data: cupom } = await supabase
      .from('coupons').select('id').ilike('code', code).maybeSingle();
    if (!cupom) return res.status(404).json({ error: 'Oferta não encontrada' });

    // Só marca quem realmente recebeu o disparo. Sem linha, não é erro: o
    // cliente pode ter recebido o código por outro caminho.
    const { data } = await supabase
      .from('coupon_broadcast_recipients')
      .update({ accepted_at: new Date().toISOString() })
      .eq('coupon_id', cupom.id)
      .eq('user_id', req.user.id)
      .is('accepted_at', null)
      .select('id');

    res.json({ ok: true, registrado: (data || []).length > 0 });
  } catch (err) { next(err); }
});

// ── GET /api/broadcast/opt-out/:token ──────────────────
// Só CONFERE o token e devolve o nome — NÃO desliga nada.
//
// A separação entre conferir (GET) e desligar (POST) não é cerimônia: o
// WhatsApp busca a prévia de todo link enviado, e antivírus e proxies
// corporativos abrem links de mensagens. Se o GET já descadastrasse, gente que
// nunca tocou no link sairia da lista sozinha.
router.get('/opt-out/:token', async (req, res, next) => {
  try {
    const { user_id } = verifyOptOutToken(req.params.token);
    const { data } = await supabase
      .from('users').select('full_name, marketing_opt_out').eq('id', user_id).maybeSingle();
    if (!data) return res.status(404).json({ error: 'Cadastro não encontrado' });
    res.json({ nome: data.full_name, ja_saiu: !!data.marketing_opt_out });
  } catch (err) { next(err); }
});

// ── POST /api/broadcast/opt-out ────────────────────────
router.post('/opt-out', async (req, res, next) => {
  try {
    const { user_id } = verifyOptOutToken(req.body?.token);
    const { error } = await supabase
      .from('users')
      .update({ marketing_opt_out: true, marketing_opt_out_at: new Date().toISOString() })
      .eq('id', user_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
