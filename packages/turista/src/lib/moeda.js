// ── moeda.js ────────────────────────────────────────────
// Exibição APROXIMADA de preços em moeda estrangeira (USD/EUR) para o turista
// gringo. O preço oficial é sempre em BRL (a cobrança é em reais); o valor
// convertido é só uma referência ("≈ US$ 70"). As taxas vêm de uma API pública
// gratuita (sem chave), com cache de 12h e um fallback embutido para nunca
// quebrar (ex.: sem rede ou atrás de proxy).

import { useEffect, useState } from 'react'

const KEY_PREF  = 'giro_moeda'          // 'BRL' | 'USD' | 'EUR'
const KEY_RATES = 'giro_moeda_rates'    // { ts, USD, EUR }  (estrangeiro por 1 BRL)
const TTL = 12 * 60 * 60 * 1000
const FALLBACK = { USD: 0.18, EUR: 0.17 } // ~aproximado; atualizado pela API quando dá

export const MOEDAS = {
  BRL: { code: 'BRL', symbol: 'R$',  locale: 'pt-BR', flag: '🇧🇷' },
  USD: { code: 'USD', symbol: 'US$', locale: 'en-US', flag: '🇺🇸' },
  EUR: { code: 'EUR', symbol: '€',   locale: 'de-DE', flag: '🇪🇺' },
}

let _pref  = (() => { try { return localStorage.getItem(KEY_PREF) || 'BRL' } catch { return 'BRL' } })()
let _rates = (() => { try { return JSON.parse(localStorage.getItem(KEY_RATES) || 'null') } catch { return null } }) ()
const subs = new Set()

function emit() { subs.forEach((fn) => fn(_pref)) }

export function setMoeda(code) {
  _pref = MOEDAS[code] ? code : 'BRL'
  try { localStorage.setItem(KEY_PREF, _pref) } catch { /* ignore */ }
  emit()
}
export function getMoeda() { return _pref }

function taxas() {
  if (_rates && (Date.now() - _rates.ts) < TTL) return _rates
  return { ...FALLBACK, ts: 0 }
}

// Atualiza as taxas em segundo plano (uma vez por sessão, respeitando o TTL).
let _buscou = false
async function atualizarTaxas() {
  if (_buscou) return
  _buscou = true
  if (_rates && (Date.now() - _rates.ts) < TTL) return
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/BRL')
    const j = await r.json()
    if (j?.rates?.USD && j?.rates?.EUR) {
      _rates = { ts: Date.now(), USD: j.rates.USD, EUR: j.rates.EUR }
      try { localStorage.setItem(KEY_RATES, JSON.stringify(_rates)) } catch { /* ignore */ }
      emit()
    }
  } catch { /* mantém fallback */ }
}

// Converte um valor em BRL para a moeda atual e formata. Em BRL, devolve null
// (não há "aproximado" a mostrar). Retorna string tipo "≈ US$ 70".
export function aprox(valorBRL) {
  if (_pref === 'BRL') return null
  const n = Number(valorBRL)
  if (!Number.isFinite(n) || n <= 0) return null
  const t = taxas()
  const fator = t[_pref]
  if (!fator) return null
  const v = n * fator
  const m = MOEDAS[_pref]
  const fmt = v.toLocaleString(m.locale, { maximumFractionDigits: v >= 100 ? 0 : 0 })
  return `≈ ${m.symbol} ${fmt}`
}

// Hook: re-renderiza quando a moeda muda; dispara a atualização das taxas.
export function useMoeda() {
  const [moeda, setM] = useState(_pref)
  useEffect(() => {
    const fn = (v) => setM(v)
    subs.add(fn)
    atualizarTaxas()
    return () => { subs.delete(fn) }
  }, [])
  return { moeda, setMoeda, aprox }
}
