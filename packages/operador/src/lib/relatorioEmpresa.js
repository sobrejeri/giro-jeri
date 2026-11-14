// Relatório da empresa por período: vendas e repasses por OPERADOR e por
// EXECUTOR. Regras PURAS — recebem o que as três telas já carregam (Reservas,
// Repasses › Quem executou, Repasses › Quem vendeu) e fazem a contabilidade.
//
// Convenções (as mesmas das telas):
//   • período pela DATA DO SERVIÇO;
//   • "vendido" = reserva paga da plataforma + venda externa ativa;
//   • repasse cancelado ("não é devido") não entra em devido nem em pago.

const cent = (n) => Math.round((Number(n) || 0) * 100) / 100
const PAPEL = { driver: 'Motorista', guide: 'Guia', pilot: 'Piloto' }
const chave = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

export function montarRelatorio({ desempenho, executores, vendedores }) {
  const vendas = (desempenho?.rows || [])
  const repExec = (executores?.rows || []).filter((r) => r.driver_payout_status !== 'cancelled')
  const repVend = (vendedores?.rows || []).filter((r) => r.driver_payout_status !== 'cancelled')

  // ── Por operador: o que vendeu e a comissão dele (empresa → operador)
  const ops = new Map()
  const op = (id, nome) => {
    if (!ops.has(id)) ops.set(id, { operator_id: id, nome: nome || 'Operador', reservas: 0, vendido_plataforma: 0, externas: 0, vendido_externo: 0, vendido_total: 0, comissao_devida: 0, comissao_paga: 0, comissao_pendente: 0 })
    return ops.get(id)
  }
  for (const o of desempenho?.operadores || []) op(o.operator_id, o.nome)
  for (const v of vendas) {
    if (!v.conta) continue
    const o = op(v.vendedor_id, v.vendedor)
    if (v.origem === 'externa') { o.externas += 1; o.vendido_externo = cent(o.vendido_externo + v.valor) }
    else { o.reservas += 1; o.vendido_plataforma = cent(o.vendido_plataforma + v.valor) }
    o.vendido_total = cent(o.vendido_plataforma + o.vendido_externo)
  }
  for (const c of repVend) {
    const o = op(c.operador_id, c.executor)
    const valor = cent(c.driver_payout_amount)
    o.comissao_devida = cent(o.comissao_devida + valor)
    if (c.driver_payout_status === 'paid') o.comissao_paga = cent(o.comissao_paga + valor)
    else o.comissao_pendente = cent(o.comissao_pendente + valor)
  }
  const operadores = [...ops.values()]
    .filter((o) => o.reservas + o.externas > 0 || o.comissao_devida > 0)
    .sort((a, b) => b.vendido_total - a.vendido_total || a.nome.localeCompare(b.nome))

  // ── Por executor: serviços feitos e o repasse dele (empresa → executor).
  // Executor é texto digitado no despacho: junta por nome (sem diferenciar
  // maiúsculas/espaços) + papel.
  const exs = new Map()
  for (const r of repExec) {
    const k = `${chave(r.executor)}|${r.executor_role || 'driver'}`
    if (!exs.has(k)) exs.set(k, { nome: String(r.executor || '').trim(), papel: PAPEL[r.executor_role] || 'Motorista', servicos: 0, repasse_devido: 0, repasse_pago: 0, repasse_pendente: 0, sem_valor: 0 })
    const e = exs.get(k)
    e.servicos += 1
    if (r.driver_payout_amount == null) { e.sem_valor += 1; continue }
    const valor = cent(r.driver_payout_amount)
    e.repasse_devido = cent(e.repasse_devido + valor)
    if (r.driver_payout_status === 'paid') e.repasse_pago = cent(e.repasse_pago + valor)
    else e.repasse_pendente = cent(e.repasse_pendente + valor)
  }
  const listaExecutores = [...exs.values()].sort((a, b) => b.repasse_devido - a.repasse_devido || a.nome.localeCompare(b.nome))

  const soma = (lista, campo) => cent(lista.reduce((s, x) => s + (x[campo] || 0), 0))
  const totais = {
    reservas: operadores.reduce((s, o) => s + o.reservas, 0),
    externas: operadores.reduce((s, o) => s + o.externas, 0),
    vendido_plataforma: soma(operadores, 'vendido_plataforma'),
    vendido_externo: soma(operadores, 'vendido_externo'),
    vendido_total: soma(operadores, 'vendido_total'),
    comissao_plataforma: cent(desempenho?.total?.comissao),      // plataforma → empresa
    comissao_devida: soma(operadores, 'comissao_devida'),
    comissao_paga: soma(operadores, 'comissao_paga'),
    comissao_pendente: soma(operadores, 'comissao_pendente'),
    servicos: listaExecutores.reduce((s, e) => s + e.servicos, 0),
    repasse_devido: soma(listaExecutores, 'repasse_devido'),
    repasse_pago: soma(listaExecutores, 'repasse_pago'),
    repasse_pendente: soma(listaExecutores, 'repasse_pendente'),
    sem_valor: listaExecutores.reduce((s, e) => s + e.sem_valor, 0),
  }
  totais.a_pagar = cent(totais.comissao_pendente + totais.repasse_pendente)
  totais.ja_pago = cent(totais.comissao_paga + totais.repasse_pago)

  return { operadores, executores: listaExecutores, totais, vendas: vendas.filter((v) => v.conta), repExec, repVend }
}

const dia = (d) => { const [y, m, x] = String(d || '').slice(0, 10).split('-'); return y && m && x ? `${x}/${m}/${y}` : '' }
const SIT = { pending: 'A pagar', paid: 'Pago' }
const H = (v) => ({ v, estilo: 1 })
const M = (v) => ({ v, tipo: 'n', estilo: 2 })
const MT = (v) => ({ v, tipo: 'n', estilo: 3 })

// Abas da planilha (formato de lib/xlsx.js).
export function abasDoRelatorio(rel, { empresa, from, to }) {
  const t = rel.totais
  return [
    { nome: 'Resumo', larguras: [38, 18], linhas: [
      [H('Relatório de vendas e repasses')], [empresa || ''], [`Período (data do serviço): ${dia(from)} a ${dia(to)}`], [],
      [H('Vendas')],
      ['Reservas pagas na plataforma', t.reservas], ['Vendido na plataforma', M(t.vendido_plataforma)],
      ['Vendas externas', t.externas], ['Vendido por fora', M(t.vendido_externo)],
      [H('Total vendido'), MT(t.vendido_total)],
      ['Comissão recebida da plataforma', M(t.comissao_plataforma)], [],
      [H('Repasses da empresa')],
      ['Comissão dos operadores — devida', M(t.comissao_devida)], ['Comissão dos operadores — paga', M(t.comissao_paga)], ['Comissão dos operadores — a pagar', M(t.comissao_pendente)],
      ['Executores — devido', M(t.repasse_devido)], ['Executores — pago', M(t.repasse_pago)], ['Executores — a pagar', M(t.repasse_pendente)],
      ['Serviços sem valor de repasse definido', t.sem_valor],
      [H('Total já pago'), MT(t.ja_pago)], [H('Total a pagar'), MT(t.a_pagar)],
    ] },
    { nome: 'Operadores', larguras: [30, 12, 18, 12, 18, 18, 18, 18, 18], linhas: [
      ['Operador', 'Reservas', 'Vendido plataforma', 'Externas', 'Vendido por fora', 'Total vendido', 'Comissão devida', 'Comissão paga', 'Comissão a pagar'].map(H),
      ...rel.operadores.map((o) => [o.nome, o.reservas, M(o.vendido_plataforma), o.externas, M(o.vendido_externo), M(o.vendido_total), M(o.comissao_devida), M(o.comissao_paga), M(o.comissao_pendente)]),
      [H('Total'), H(t.reservas), MT(t.vendido_plataforma), H(t.externas), MT(t.vendido_externo), MT(t.vendido_total), MT(t.comissao_devida), MT(t.comissao_paga), MT(t.comissao_pendente)],
    ] },
    { nome: 'Executores', larguras: [30, 14, 12, 18, 18, 18, 14], linhas: [
      ['Executor', 'Função', 'Serviços', 'Repasse devido', 'Repasse pago', 'Repasse a pagar', 'Sem valor'].map(H),
      ...rel.executores.map((e) => [e.nome, e.papel, e.servicos, M(e.repasse_devido), M(e.repasse_pago), M(e.repasse_pendente), e.sem_valor]),
      [H('Total'), H(''), H(t.servicos), MT(t.repasse_devido), MT(t.repasse_pago), MT(t.repasse_pendente), H(t.sem_valor)],
    ] },
    { nome: 'Vendas', larguras: [12, 14, 14, 36, 26, 26, 16, 16], linhas: [
      ['Data', 'Origem', 'Código', 'Serviço', 'Vendeu', 'Executou', 'Valor', 'Comissão da plataforma'].map(H),
      ...rel.vendas.map((v) => [dia(v.service_date), v.origem === 'externa' ? 'Por fora' : 'Plataforma', v.codigo || '', v.servico, v.vendedor, v.executor || '', M(v.valor), v.comissao == null ? '' : M(v.comissao)]),
    ] },
    { nome: 'Repasses', larguras: [12, 14, 20, 28, 14, 16, 14, 14, 30], linhas: [
      ['Data do serviço', 'Código', 'Tipo', 'Quem recebe', 'Função', 'Valor', 'Situação', 'Pago em', 'Observação'].map(H),
      ...rel.repVend.map((r) => [dia(r.service_date), r.booking_code, 'Comissão de venda', r.executor, 'Operador', M(r.driver_payout_amount), SIT[r.driver_payout_status] || '', dia(r.driver_paid_at), r.driver_payout_notes || '']),
      ...rel.repExec.map((r) => [dia(r.service_date), r.booking_code, 'Execução', r.executor, PAPEL[r.executor_role] || 'Motorista', r.driver_payout_amount == null ? 'sem valor' : M(r.driver_payout_amount), SIT[r.driver_payout_status] || '', dia(r.driver_paid_at), r.driver_payout_notes || '']),
    ] },
  ]
}
