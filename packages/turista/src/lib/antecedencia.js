// Antecedência mínima de uma solicitação: quanto tempo antes do serviço o
// cliente precisa reservar.
//
// UMA regra, um arquivo — as telas de translado (celular e PC) e o resumo do
// checkout perguntam todas aqui. Antes cada uma decidia por conta própria, e o
// resultado foi o esperado: o resumo não checava NADA (dava para pedir um
// passeio para hoje às 21:30 às 20h e o botão seguia ativo), e as duas telas de
// translado usavam 4h enquanto o servidor usa 3h — a tela recusava horários que
// a API aceitaria.
//
// Regra, decidida com o dono:
//   • cada serviço pode definir a sua (`min_advance_hours`, no admin);
//   • sem isso, translado usa o padrão global de 3h e PASSEIO NÃO TEM MÍNIMO —
//     nele o freio é o `booking_cutoff_time`, o horário limite para o mesmo dia.
//
// Tudo em America/Fortaleza, que é UTC-3 o ano todo (sem horário de verão).
// Usar o relógio do aparelho daria errado para um cliente reservando de outro
// fuso — e turista estrangeiro é o caso comum aqui, não a exceção.

// Espelha `transfer_min_advance_hours` (migration 040). O servidor manda; isto
// aqui só evita mostrar ao cliente um horário que a API vai recusar.
export const HORAS_PADRAO_TRANSFER = 3

/**
 * Horas de antecedência que valem para este serviço.
 * @param {'tour'|'transfer'} tipo
 * @param {number|null|undefined} doServico  `min_advance_hours` do cadastro
 */
export function horasDeAntecedencia(tipo, doServico) {
  const proprio = Number(doServico)
  // >= 0 de propósito: zero é uma escolha válida do admin ("sem antecedência"),
  // e `Number(null)` é 0 — por isso o teste é sobre o valor original, não sobre
  // o número convertido.
  if (doServico != null && Number.isFinite(proprio) && proprio >= 0) return proprio
  return tipo === 'transfer' ? HORAS_PADRAO_TRANSFER : 0
}

/** Agora, no relógio de Jericoacoara, como Date local para comparar/formatar. */
export function agoraEmFortaleza() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a }, {})
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), 0)
}

/** Primeiro instante reservável: agora + as horas exigidas. */
export function primeiroReservavel(horas) {
  const d = agoraEmFortaleza()
  d.setHours(d.getHours() + (Number(horas) || 0))
  return d
}
