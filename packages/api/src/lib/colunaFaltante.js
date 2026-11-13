// Nome da coluna que o banco disse não existir — migração ainda não rodada em
// relação ao deploy. Cobre o 42703 do Postgres ('column "x" ... does not
// exist') e o PGRST204 do PostgREST ("Could not find the 'x' column ... schema
// cache"). Devolve null quando o erro é outro.
export function colunaFaltante(error) {
  if (!error) return null
  const msg = String(error.message || '')
  const m = msg.match(/Could not find the '([^']+)' column/i)
    || msg.match(/column "?([a-z0-9_]+)"? .* does not exist/i)
  return m ? m[1] : null
}
