// Helpers puros/consultas somente-leitura para o diagnostico de go-live.
// Nenhuma funcao deste modulo executa escrita ou alteracao de schema.

const temValor = (v) => typeof v === 'string' && v.trim().length > 0;
const segredoForte = (v) => typeof v === 'string' && v.length >= 32;

export function verificarSegredosDeCadastro(env = {}) {
  const baseSegura = temValor(env.SUPABASE_SERVICE_ROLE_KEY);
  const otpDedicado = segredoForte(env.OTP_PEPPER);
  const cadastroDedicado = segredoForte(env.SIGNUP_TOKEN_SECRET);
  const ok = (otpDedicado || baseSegura) && (cadastroDedicado || baseSegura);
  return {
    ok,
    detalhe: !ok
      ? 'sem segredo seguro para OTP ou cadastro'
      : otpDedicado && cadastroDedicado
        ? 'segredos dedicados definidos'
        : 'chaves ausentes ou curtas derivadas da service role',
  };
}

// Supabase retorna `error` no objeto da consulta. Um erro de conexao,
// permissao, coluna ou tabela ausente deve sempre resultar em FALSE.
export async function verificarColunas(db, tabela, colunas) {
  if (!Array.isArray(colunas) || colunas.length === 0) return false;
  try {
    const { error } = await db.from(tabela).select(colunas.join(', '), { head: true }).limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function verificarTabela(db, tabela) {
  try {
    const { error } = await db.from(tabela).select('id', { head: true, count: 'exact' }).limit(1);
    return !error;
  } catch {
    return false;
  }
}
