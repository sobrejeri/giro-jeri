// Login devolve o token apenas a perfis explicitamente ativos.
// Supabase Auth valida a senha, mas o bloqueio administrativo vive em users.
// A mesma regra ja e exigida por middleware/auth.js nas rotas protegidas.
export function perfilAtivoParaLogin(profile) {
  return profile?.is_active === true
}
