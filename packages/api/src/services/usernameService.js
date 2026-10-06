// Geração automática do @ e limite de trocas (2 a cada 15 dias).
import { supabase } from '../supabase.js';
import { slugUsername, validateUsername } from '../lib/username.js';

const JANELA_MS = 15 * 24 * 60 * 60 * 1000; // 15 dias
const MAX_TROCAS = 2;

// Encontra um username livre a partir de uma base (base, base1, base2, …).
export async function gerarUsernameUnico(base) {
  let raiz = slugUsername(base);
  if (validateUsername(raiz).error) raiz = slugUsername(`user ${raiz}`);
  for (let i = 0; i < 60; i++) {
    const cand = (i === 0 ? raiz : `${raiz}${i}`).slice(0, 30);
    const { data, error } = await supabase.from('users').select('id').eq('username', cand).maybeSingle();
    if (error && error.code === '42703') return null; // coluna username ausente
    if (!data) return cand;
  }
  return `${raiz}${String(Date.now()).slice(-5)}`.slice(0, 30);
}

// Garante que o usuário tenha um @ — se não tiver, gera a partir do nome.
// A geração automática NÃO conta no limite de trocas. Devolve o username.
export async function garantirUsername(userId) {
  try {
    const { data: u } = await supabase.from('users').select('username, full_name').eq('id', userId).maybeSingle();
    if (!u) return null;
    if (u.username) return u.username;
    const novo = await gerarUsernameUnico(u.full_name || 'operador');
    if (!novo) return null;
    // Só grava se ainda estiver nulo (evita corrida).
    await supabase.from('users').update({ username: novo }).eq('id', userId).is('username', null);
    return novo;
  } catch { return null; }
}

// Avalia uma TROCA manual de @: valida formato, unicidade e o limite de 2 a
// cada 15 dias. Devolve { username, changes } para gravar, ou { error, status }.
// `atual` é o username atual (para não contar "troca" quando não mudou).
export async function prepararTrocaUsername({ userId, novoRaw, atual, changesAtuais }) {
  const { username, error } = validateUsername(novoRaw);
  if (error) return { error, status: 400 };

  // Sem mudança real → não mexe no histórico.
  if (atual && username === atual) return { username, changes: changesAtuais };

  // Unicidade (case-insensitive — guardamos em minúsculas).
  const { data: taken, error: tErr } = await supabase
    .from('users').select('id').eq('username', username).neq('id', userId).maybeSingle();
  if (tErr?.code === '42703') return { error: 'Recurso indisponível: aplique a migration 061 (coluna username).', status: 400 };
  if (tErr) return { error: tErr.message, status: 500 };
  if (taken) return { error: 'Este nome de usuário já está em uso.', status: 409 };

  // Limite: no máximo 2 trocas nos últimos 15 dias.
  const agora = Date.now();
  const recentes = (Array.isArray(changesAtuais) ? changesAtuais : [])
    .map((t) => Date.parse(t)).filter((t) => !isNaN(t) && agora - t < JANELA_MS);
  if (recentes.length >= MAX_TROCAS) {
    const liberaEm = new Date(Math.min(...recentes) + JANELA_MS);
    const dias = Math.max(1, Math.ceil((liberaEm.getTime() - agora) / (24 * 60 * 60 * 1000)));
    return { error: `Você só pode mudar o @ ${MAX_TROCAS} vezes a cada 15 dias. Tente de novo em ~${dias} dia(s).`, status: 429 };
  }
  const changes = [...recentes.map((t) => new Date(t).toISOString()), new Date(agora).toISOString()];
  return { username, changes };
}
