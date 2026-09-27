// Acréscimo de parcelamento no cartão (juros repassado ao cliente).
// Origem: tabela CET da Pagar.me; repassamos só o EXTRA do parcelamento
// (CET(n) − CET à vista). 1x é sempre sem juros.
// Pode ser sobrescrita por system_settings.payment_installment_fees (JSON
// { "2": 3.06, ... } em % de acréscimo por nº de parcelas).
export const DEFAULT_INSTALLMENT_FEES = {
  2: 3.06, 3: 4.36, 4: 5.66, 5: 6.96, 6: 8.27, 7: 10.55,
  8: 11.84, 9: 13.12, 10: 14.41, 11: 15.70, 12: 16.98,
};

const round2 = (v) => Math.round(Number(v) * 100) / 100;

// Lê a tabela do system_settings (JSON) ou usa a padrão. Tolerante a valor
// ausente/ inválido → cai na padrão.
export function tabelaDeParcelas(raw) {
  if (!raw) return DEFAULT_INSTALLMENT_FEES;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (obj && typeof obj === 'object' && Object.keys(obj).length) return obj;
  } catch { /* json inválido — usa padrão */ }
  return DEFAULT_INSTALLMENT_FEES;
}

// % de acréscimo para n parcelas (0 quando 1x ou sem entrada na tabela).
export function acrescimoPct(n, tabela = DEFAULT_INSTALLMENT_FEES) {
  const k = Number(n) || 1;
  if (k <= 1) return 0;
  const pct = Number(tabela[k] ?? tabela[String(k)] ?? 0);
  return isFinite(pct) && pct > 0 ? pct : 0;
}

// Total com juros e valor de cada parcela para um valor-base.
export function totalComJuros(base, n, tabela = DEFAULT_INSTALLMENT_FEES) {
  const pct = acrescimoPct(n, tabela);
  const total = round2(Number(base) * (1 + pct / 100));
  return { pct, total, parcela: round2(total / (Number(n) || 1)), acrescimo: round2(total - Number(base)) };
}
