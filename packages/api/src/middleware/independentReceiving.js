import { supabase } from '../supabase.js';

export async function requireIndependentReceiving(req, res, next) {
  try {
    const { data, error } = await supabase.from('users')
      .select('company_id').eq('id', req.user.id).single();
    if (error) throw error;
    if (data.company_id) {
      return res.status(409).json({ error: 'O recebimento é administrado pela empresa vinculada.' });
    }
    next();
  } catch (error) {
    next(error);
  }
}
