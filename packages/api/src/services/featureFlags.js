// =============================================================================
// featureFlags.js — leitura cacheável de flags em system_settings
// =============================================================================
// Etapa 2 (motor de pernas): TODO o comportamento novo de booking_legs fica
// atrás de `booking_legs_engine_enabled`. Fail-closed: qualquer erro ao ler a
// flag mantém o comportamento ANTIGO (flag = false) — nunca liga o motor por
// acidente por causa de uma falha transitória de rede/DB.
import { supabase } from '../supabase.js'

const CACHE_TTL_MS = 15_000 // 15s — baixo o bastante para propagar toggles rápido em staging/produção

let cache = { value: false, expiresAt: 0 }

export async function isBookingLegsEngineEnabled({ force = false } = {}) {
  const now = Date.now()
  if (!force && cache.expiresAt > now) return cache.value

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'booking_legs_engine_enabled')
      .maybeSingle()
    if (error) throw error

    const value = data?.setting_value === 'true'
    cache = { value, expiresAt: now + CACHE_TTL_MS }
    return value
  } catch (err) {
    console.error('[featureFlags] falha ao ler booking_legs_engine_enabled — assumindo desligado (fail-closed):', err.message)
    cache = { value: false, expiresAt: now + CACHE_TTL_MS }
    return false
  }
}

// Exposto só para os testes manuais (força reler no próximo GET após ligar a
// flag em staging, sem esperar o TTL do cache).
export function _invalidateFeatureFlagCache() {
  cache = { value: false, expiresAt: 0 }
}
