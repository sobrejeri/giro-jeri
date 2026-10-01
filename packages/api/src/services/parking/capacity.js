// ── parking/capacity.js — Disponibilidade por intervalo (anti-overbooking) ───
//
// A regra central: "vagas livres agora" ≠ "disponibilidade para um período".
// Para aceitar uma reserva, o que importa é o PICO de ocupação em QUALQUER
// trecho do intervalo pedido — não a soma de todos os pedidos que cruzam
// qualquer parte dele. Intervalos são [início, fim): saída 10h e entrada 10h
// compartilham capacidade (salvo intervalo operacional, tratado depois).

// Pico de ocupação dentro da janela [janelaIni, janelaFim), somando `qty` dos
// blocos ativos que cobrem cada instante candidato. Varredura por eventos: os
// únicos instantes onde a ocupação pode subir são os inícios de bloco (e o
// próprio início da janela).
export function picoDeOcupacao(blocks, janelaIni, janelaFim) {
  const candidatos = [janelaIni]
  for (const b of blocks) {
    if (b.start > janelaIni && b.start < janelaFim) candidatos.push(b.start)
  }
  let pico = 0
  for (const t of candidatos) {
    let soma = 0
    for (const b of blocks) {
      if (b.start <= t && t < b.end) soma += Number(b.qty) || 0
    }
    if (soma > pico) pico = soma
  }
  return pico
}

// Decide se cabem `want` unidades no intervalo, dada a capacidade e os blocos
// existentes. Só considera blocos que SOBREPÕEM a janela (b.start < fim &&
// b.end > ini). Devolve o pico, as vagas no pico e se cabe.
export function temVaga({ capacidade, blocks, start, end, want = 1 }) {
  const relevantes = (blocks || []).filter((b) => b.start < end && b.end > start)
  const pico = picoDeOcupacao(relevantes, start, end)
  const disponivel = capacidade - pico
  return { pico, disponivel, cabe: (pico + want) <= capacidade }
}

// Normaliza uma linha de bloqueio/reserva do banco em { start, end, qty } (ms).
export function blocoDe(row, { startKey = 'start_at', endKey = 'end_at', qtyKey = 'qty' } = {}) {
  return {
    start: new Date(row[startKey]).getTime(),
    end:   new Date(row[endKey]).getTime(),
    qty:   Number(row[qtyKey]) || 1,
  }
}
