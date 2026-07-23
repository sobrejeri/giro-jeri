// Validação/normalização de nome de usuário (login por username).
// Regras: 3–30 caracteres, minúsculas, números, ponto e sublinhado; deve
// começar e terminar com letra/número; sem dois pontos seguidos. Guardamos
// sempre em minúsculas (a unicidade é case-insensitive no banco — migration 061).

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/;

// Nomes que não podem ser registrados por usuários comuns.
const RESERVED = new Set([
  'admin', 'administrador', 'root', 'suporte', 'support', 'ajuda', 'help',
  'turiva', 'sistema', 'system', 'oficial', 'contato', 'null', 'undefined',
  'me', 'eu', 'user', 'usuario',
]);

export function normalizeUsername(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

// Retorna { username } quando válido, ou { error } com mensagem amigável (pt).
export function validateUsername(raw) {
  const u = normalizeUsername(raw);
  if (!u) return { error: 'Informe um nome de usuário.' };
  if (u.length < 3 || u.length > 30) {
    return { error: 'O nome de usuário deve ter entre 3 e 30 caracteres.' };
  }
  if (!USERNAME_RE.test(u)) {
    return { error: 'Use apenas letras, números, ponto e sublinhado (começando e terminando com letra ou número).' };
  }
  if (u.includes('..')) {
    return { error: 'O nome de usuário não pode ter dois pontos seguidos.' };
  }
  if (RESERVED.has(u)) {
    return { error: 'Este nome de usuário não está disponível.' };
  }
  return { username: u };
}
