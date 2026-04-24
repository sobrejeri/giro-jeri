/**
 * /api/operator — Preferências de serviço do operador/cooperativa
 * GET  /api/operator/preferences          — lista preferências próprias
 * PUT  /api/operator/preferences/:type/:id — ativa ou desativa um serviço
 */
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate, requireOperator } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireOperator);

// GET /api/operator/preferences
router.get('/preferences', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('operator_service_preferences')
      .select('entity_type, entity_id, is_active, notes')
      .eq('operator_id', req.user.id);
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// PUT /api/operator/preferences/:type/:id
// body: { is_active: boolean, notes?: string }
router.put('/preferences/:type/:entityId', async (req, res, next) => {
  try {
    const { type, entityId } = req.params;
    const { is_active, notes } = req.body;

    if (!['tour', 'vehicle', 'transfer'].includes(type)) {
      return res.status(400).json({ error: 'entity_type inválido' });
    }

    const { data, error } = await supabase
      .from('operator_service_preferences')
      .upsert(
        {
          operator_id: req.user.id,
          entity_type: type,
          entity_id:   entityId,
          is_active:   is_active !== undefined ? is_active : true,
          notes:       notes || null,
          updated_at:  new Date().toISOString(),
        },
        { onConflict: 'operator_id,entity_type,entity_id' },
      )
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
