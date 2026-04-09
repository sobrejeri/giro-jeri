import { supabase } from '../supabase.js';

// ── Autentica o JWT do Supabase ────────────────────────
export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }

  const token = header.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, full_name, email, phone, user_type, is_active, preferred_region_id')
      .eq('auth_id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ error: 'Perfil não encontrado' });
    }

    if (!profile.is_active) {
      return res.status(403).json({ error: 'Conta suspensa ou inativa' });
    }

    req.user = profile;
    next();
  } catch {
    return res.status(401).json({ error: 'Erro ao validar autenticação' });
  }
}

// ── Verifica roles ─────────────────────────────────────
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (!roles.includes(req.user.user_type)) {
      return res.status(403).json({
        error: `Acesso restrito. Requerido: ${roles.join(' ou ')}`,
      });
    }
    next();
  };
}

export const requireAdmin    = requireRole('admin');
export const requireOperator = requireRole('operator', 'admin');
export const requireAgency   = requireRole('agency', 'operator', 'admin');
export const requireAny      = requireRole('tourist', 'agency', 'operator', 'admin', 'finance');
