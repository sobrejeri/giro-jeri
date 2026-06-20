// ── lib/phone.js ────────────────────────────────────────
// Normalização E.164 via google-libphonenumber.
// Retorna '+55...' ou null se o número for inválido.

import libpkg from 'google-libphonenumber';

const { PhoneNumberUtil, PhoneNumberFormat } = libpkg;
const phoneUtil = PhoneNumberUtil.getInstance();

/**
 * Converte um número cru para E.164.
 * @param {string} raw            - Número digitado (com ou sem +, DDI, etc.)
 * @param {string} defaultCountry - ISO 3166-1 alpha-2, padrão 'BR'
 * @returns {string|null}         - '+5588999999999' ou null
 */
export function normalizeToE164(raw, defaultCountry = 'BR') {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = phoneUtil.parseAndKeepRawInput(raw.trim(), defaultCountry);
    if (!phoneUtil.isValidNumber(parsed)) return null;
    return phoneUtil.format(parsed, PhoneNumberFormat.E164);
  } catch {
    return null;
  }
}
