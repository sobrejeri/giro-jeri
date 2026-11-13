// Vínculo OPERADOR → EMPRESA (users.company_id, migração 129).
//
// Toda leitura do vínculo passa por aqui porque o deploy da API chega ANTES de
// o dono rodar a migração no Supabase: sem a coluna, um `select company_id`
// devolve erro e — se a leitura estiver no caminho do pagamento — derruba a
// cobrança de TODO MUNDO. Coluna ausente significa "ninguém está vinculado",
// que é exatamente o comportamento de antes do recurso. Qualquer OUTRO erro
// continua subindo: na dúvida sobre o vínculo, não se divide dinheiro.

import { supabase } from '../supabase.js'
import { colunaFaltante } from './colunaFaltante.js'

export const MSG_MIGRACAO_EMPRESA =
  'O vínculo com empresa ainda não foi ativado no banco. Rode a migração 129 no Supabase e tente de novo.'

// O erro é a coluna/relacionamento do vínculo ainda não existir?
export function semVinculoNoBanco(error) {
  if (!error) return false
  const alvo = /company_id|origin_operator_id/
  if (alvo.test(colunaFaltante(error) || '')) return true
  // PGRST200 = relacionamento (FK) não encontrado no cache do PostgREST.
  return ['42703', 'PGRST204', 'PGRST200'].includes(error.code) && alvo.test(String(error.message || ''))
}

// Empresa à qual o operador está vinculado (id) — ou null.
export async function empresaDoOperador(operatorId) {
  if (!operatorId) return null
  const { data, error } = await supabase.from('users')
    .select('company_id').eq('id', operatorId).maybeSingle()
  if (error) {
    if (semVinculoNoBanco(error)) return null
    throw error
  }
  return data?.company_id || null
}

// Algum destes operadores está vinculado a uma empresa?
export async function algumOperadorVinculado(operatorIds) {
  const ids = [...new Set((operatorIds || []).filter(Boolean))]
  if (!ids.length) return false
  const { data, error } = await supabase.from('users').select('id')
    .in('id', ids).not('company_id', 'is', null).limit(1)
  if (error) {
    if (semVinculoNoBanco(error)) return false
    throw error
  }
  return Boolean(data?.length)
}
