// ── reviews.js ─────────────────────────────────────────
// Avaliações REAIS e verificadas: só quem tem reserva PAGA e já realizada
// (concluída pela coop ou com a data do serviço passada) pode avaliar — 1 por
// reserva (UNIQUE booking_id). A nota vale para a COOPERATIVA que executou
// (reputação por coop) e alimenta a média do passeio.
import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { authenticate } from '../middleware/auth.js';
import { notifyUser } from '../services/notify.js';

export const reviewsRouter = Router();

const createSchema = z.object({
  booking_id: z.string().uuid(),
  rating:     z.number({ coerce: true }).int().min(1).max(5),
  comment:    z.string().max(1000).optional().nullable(),
});

const todayIsoFortaleza = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());

// ── GET /api/reviews — lista pública com filtros ────────
// ?operator_id=…&service_type=tour|transfer&min_rating=1..5&limit=…&offset=…
reviewsRouter.get('/', async (req, res, next) => {
  try {
    const { operator_id, service_type, min_rating } = req.query;
    const limit  = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    let q = supabase
      .from('reviews')
      .select('id, rating, comment_text, service_type, service_id, operator_id, user_id, created_at', { count: 'exact' })
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (operator_id)  q = q.eq('operator_id', operator_id);
    if (service_type) q = q.eq('service_type', service_type);
    if (min_rating)   q = q.gte('rating', Number(min_rating));

    const { data: rows, error, count } = await q;
    if (error) throw error;
    const list = rows || [];

    // Enriquecimento em memória (sem FKs frágeis): autor, coop e serviço.
    const userIds = [...new Set(list.map((r) => r.user_id).concat(list.map((r) => r.operator_id)).filter(Boolean))];
    const tourIds = [...new Set(list.filter((r) => r.service_type === 'tour').map((r) => r.service_id))];
    const routeIds = [...new Set(list.filter((r) => r.service_type === 'transfer').map((r) => r.service_id))];

    const [usersRes, toursRes, routesRes] = await Promise.all([
      userIds.length ? supabase.from('users').select('id, full_name, profile_photo_url').in('id', userIds) : { data: [] },
      tourIds.length ? supabase.from('tours').select('id, name').in('id', tourIds) : { data: [] },
      routeIds.length ? supabase.from('transfer_routes').select('id, origin_name, destination_name').in('id', routeIds) : { data: [] },
    ]);
    const userById  = new Map((usersRes.data || []).map((u) => [u.id, u]));
    const tourById  = new Map((toursRes.data || []).map((t) => [t.id, t]));
    const routeById = new Map((routesRes.data || []).map((r) => [r.id, r]));

    const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'Turista';

    res.json({
      total: count ?? list.length,
      reviews: list.map((r) => {
        const author = userById.get(r.user_id);
        const coop   = userById.get(r.operator_id);
        const route  = routeById.get(r.service_id);
        return {
          id:            r.id,
          rating:        r.rating,
          comment:       r.comment_text,
          created_at:    r.created_at,
          service_type:  r.service_type,
          service_name:  r.service_type === 'tour'
            ? (tourById.get(r.service_id)?.name || 'Passeio')
            : route ? `${route.origin_name} → ${route.destination_name}` : 'Translado',
          author_name:   firstName(author?.full_name),
          author_photo:  author?.profile_photo_url || null,
          operator_id:   r.operator_id,
          operator_name: coop?.full_name || null,
        };
      }),
    });
  } catch (err) { next(err); }
});

// ── GET /api/reviews/summary — reputação por cooperativa ─
reviewsRouter.get('/summary', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('operator_id, rating')
      .eq('is_public', true)
      .not('operator_id', 'is', null);
    if (error) throw error;

    const agg = new Map();
    for (const r of data || []) {
      const a = agg.get(r.operator_id) || { sum: 0, count: 0 };
      a.sum += r.rating; a.count += 1;
      agg.set(r.operator_id, a);
    }
    const ids = [...agg.keys()];
    const { data: coops } = ids.length
      ? await supabase.from('users').select('id, full_name, profile_photo_url').in('id', ids)
      : { data: [] };
    const coopById = new Map((coops || []).map((c) => [c.id, c]));

    res.json(ids.map((id) => ({
      operator_id:   id,
      operator_name: coopById.get(id)?.full_name || 'Cooperativa',
      operator_photo: coopById.get(id)?.profile_photo_url || null,
      rating_average: Math.round((agg.get(id).sum / agg.get(id).count) * 10) / 10,
      rating_count:   agg.get(id).count,
    })).sort((a, b) => b.rating_count - a.rating_count));
  } catch (err) { next(err); }
});

// ── GET /api/reviews/mine — reservas que EU já avaliei ───
reviewsRouter.get('/mine', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('booking_id, rating')
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

// ── POST /api/reviews — avaliar uma reserva realizada ────
reviewsRouter.post('/', authenticate, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' });
    }
    const { booking_id, rating, comment } = parsed.data;

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, user_id, operator_id, service_type, service_id, status_commercial, status_operational, service_date, booking_code')
      .eq('id', booking_id)
      .maybeSingle();

    if (!booking || booking.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Reserva não encontrada nesta conta.' });
    }
    // Verificada de verdade: paga E realizada (concluída ou data já passada).
    const paid = booking.status_commercial === 'paid';
    const done = booking.status_operational === 'completed'
      || (booking.service_date && booking.service_date <= todayIsoFortaleza());
    if (!paid || !done) {
      return res.status(409).json({ error: 'Você poderá avaliar depois que o serviço for realizado.' });
    }

    const { data: review, error } = await supabase
      .from('reviews')
      .insert({
        booking_id,
        user_id:      req.user.id,
        service_type: booking.service_type,
        service_id:   booking.service_id,
        operator_id:  booking.operator_id || null,
        rating,
        comment_text: (comment || '').trim() || null,
      })
      .select('id, rating, comment_text, created_at')
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Esta reserva já foi avaliada.' });
      if (error.code === '42703') {
        return res.status(503).json({ error: 'Avaliações em manutenção — rode a migration 060.' });
      }
      throw error;
    }

    // Média do passeio (tours.rating_average/rating_count) — recalculada real.
    if (booking.service_type === 'tour') {
      const { data: all } = await supabase
        .from('reviews')
        .select('rating')
        .eq('service_type', 'tour')
        .eq('service_id', booking.service_id)
        .eq('is_public', true);
      const ratings = (all || []).map((r) => r.rating);
      if (ratings.length) {
        await supabase.from('tours').update({
          rating_average: Math.round((ratings.reduce((s, x) => s + x, 0) / ratings.length) * 10) / 10,
          rating_count:   ratings.length,
        }).eq('id', booking.service_id);
      }
    }

    // Avisa a cooperativa: reputação chegando.
    if (booking.operator_id) {
      notifyUser({
        userId:      booking.operator_id,
        bookingId:   booking.id,
        templateKey: 'new_review',
        title:       `Você recebeu ${rating} estrela${rating > 1 ? 's' : ''} ⭐`,
        body:        `Um cliente avaliou o serviço ${booking.booking_code}${comment ? `: "${String(comment).slice(0, 120)}"` : '.'}`,
      });
    }

    res.status(201).json(review);
  } catch (err) { next(err); }
});
