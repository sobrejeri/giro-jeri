// ── document.js ────────────────────────────────────────
// Validação de CPF/CNPJ pelos DÍGITOS VERIFICADORES (algoritmo oficial,
// módulo 11). Barra números inventados/digitações erradas — não consulta a
// Receita (isso diria se o CPF "existe", mas exige serviço pago); para
// cadastro, o verificador elimina praticamente todo CPF falso casual.

export function isValidCPF(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // 000..., 111..., etc.
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(d[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== Number(d[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += Number(d[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === Number(d[10]);
}

export function isValidCNPJ(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const calc = (base, weights) => {
    const s = weights.reduce((acc, w, i) => acc + Number(base[i]) * w, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(d[12])) return false;
  const d2 = calc(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(d[13]);
}

// Mensagem de erro pronta (null = ok / tipo não validável aqui).
export function validateBrDoc(type, number) {
  if (!number) return null;
  if (type === 'cpf'  && !isValidCPF(number))  return 'CPF inválido — confira os dígitos.';
  if (type === 'cnpj' && !isValidCNPJ(number)) return 'CNPJ inválido — confira os dígitos.';
  return null;
}
