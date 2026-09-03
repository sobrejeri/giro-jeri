// ── seasons.js ─────────────────────────────────────────
// Leitura PÚBLICA das regras que dão acréscimo por data — usada pelo app do
// turista para sinalizar no calendário as datas com sobretaxa (cor diferente).
// Só expõe campos não sensíveis; escrita continua no /api/admin.
//
// Devolve DOIS tipos de regra na mesma lista, cada uma marcada em `kind`:
//
//   season   faixa RECORRENTE (o ano gravado é ignorado: "julho a janeiro"
//            vale todo ano)
//   holiday  data EXATA, com ano — e tem PRECEDÊNCIA sobre a temporada
//
// Antes daqui saíam só as temporadas. O feriado existia no motor de preços
// (priceEngine → getDateSurcharge) mas nunca chegava ao app: o calendário não
// pintava a data, o cliente via um dia comum e a sobretaxa aparecia depois, no
// resumo. Manter as duas fontes separadas é o que produzia essa divergência.
import { Router } from 'express';
import { supabase } from '../supabase.js';

export const seasonsRouter = Router();

seasonsRouter.get('/', async (req, res, next) => {
  try {
    const { region_id } = req.query;

    // Regra global (region_id nulo) OU da região pedida. O filtro é feito em
    // memória para as duas fontes, com o mesmo critério.
    const daRegiao = (r) => !region_id || r.region_id == null || r.region_id === region_id;

    const [temporadas, feriados] = await Promise.all([
      supabase
        .from('high_season_rules')
        .select('id, name, start_date, end_date, additional_type, additional_value, region_id')
        .eq('is_active', true),
      supabase
        .from('holidays')
        .select('id, name, holiday_date, additional_type, additional_value, region_id')
        .eq('is_active', true)
        .eq('affects_pricing', true),
    ]);

    if (temporadas.error) throw temporadas.error;

    const rows = (temporadas.data || []).filter(daRegiao)
      .map((r) => ({ ...r, kind: 'season' }));

    // Feriado indisponível não derruba o calendário: a tela continua marcando
    // a alta temporada, que é o caso mais comum.
    if (feriados.error) {
      console.warn('[seasons] feriados indisponíveis:', feriados.error.message);
    } else {
      for (const h of (feriados.data || []).filter(daRegiao)) {
        rows.push({
          ...h,
          kind: 'holiday',
          // start/end iguais à data mantêm a forma que o app já conhece — um
          // cliente com versão antiga do JS ainda pinta o dia certo, mesmo sem
          // entender `kind`.
          start_date: h.holiday_date,
          end_date:   h.holiday_date,
        });
      }
    }

    res.json(rows);
  } catch (err) { next(err); }
});
