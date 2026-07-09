import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
}

// Diagnóstico de boot: loga o PAPEL da chave carregada (nunca a chave em si).
// Chave legada é um JWT com claim "role" (anon | service_role); chave nova do
// Supabase começa com sb_secret_/sb_publishable_. Se aparecer "anon" no log,
// a env var do deploy está com a chave errada (explica erros de RLS na API).
try {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let papel = 'formato desconhecido';
  if (k.startsWith('sb_secret_')) papel = 'sb_secret (nova, equivale a service_role)';
  else if (k.startsWith('sb_publishable_')) papel = 'sb_publishable (nova, equivale a ANON — ERRADA aqui)';
  else if (k.split('.').length === 3) {
    papel = JSON.parse(Buffer.from(k.split('.')[1], 'base64').toString()).role || 'jwt sem claim role';
  }
  console.log('[supabase] chave carregada: role=%s | url=%s', papel, process.env.SUPABASE_URL);
} catch {
  console.warn('[supabase] não consegui decodificar a chave para diagnóstico');
}

// Service role — só no backend, nunca expor no frontend
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
