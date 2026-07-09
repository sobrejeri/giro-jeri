// ── seasons.js ─────────────────────────────────────────
// Leitura PÚBLICA das regras de alta temporada ativas — usado pelo app do
// turista para sinalizar no calendário as datas com acréscimo (cor diferente).
// Só expõe campos não sensíveis; escrita continua no /api/admin/seasons.
import { Router } from 'express';
import { supabase } from '../supabase.js';

export const seasonsRouter = Router();

seasonsRouter.get('/', async (req, res, next) => {
  try {
    const { region_id } = req.query;
    let query = supabase
      .from('high_season_rules')
      .select('id, name, start_date, end_date, additional_type, additional_value, region_id')
      .eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    // Filtra em memória: regra global (region_id NULL) OU da região pedida.
    const rows = (data || []).filter(
      (r) => !region_id || r.region_id == null || r.region_id === region_id,
    );
    res.json(rows);
  } catch (err) { next(err); }
});
