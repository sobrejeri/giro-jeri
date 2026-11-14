// PDF do relatório da empresa (A4 deitado): resumo, por operador e por executor.
// jsPDF puro — tabelas simples desenhadas à mão, sem plugin.
import { jsPDF } from 'jspdf'

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = (d) => { const [y, m, x] = String(d || '').slice(0, 10).split('-'); return y && m && x ? `${x}/${m}/${y}` : '' }
const MARGEM = 12, LARGURA = 297, ALTURA = 210, LINHA = 6.5

export function montarRelatorioPDF(rel, { empresa, from, to }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  let y = MARGEM
  const pagina = () => { doc.addPage(); y = MARGEM }
  const cabe = (alt) => { if (y + alt > ALTURA - MARGEM) pagina() }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20)
  doc.text('Relatório de vendas e repasses', MARGEM, y + 4); y += 9
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90)
  doc.text(`${empresa || ''}  ·  Período (data do serviço): ${dia(from)} a ${dia(to)}`, MARGEM, y + 2); y += 8

  // Quadro-resumo
  const t = rel.totais
  const quadros = [
    ['Total vendido', moeda(t.vendido_total), `${t.reservas} na plataforma · ${t.externas} por fora`],
    ['Comissão da plataforma', moeda(t.comissao_plataforma), 'recebida pela empresa'],
    ['Já pago à equipe', moeda(t.ja_pago), 'operadores + executores'],
    ['A pagar à equipe', moeda(t.a_pagar), t.sem_valor ? `+ ${t.sem_valor} serviço(s) sem valor` : 'operadores + executores'],
  ]
  const lq = (LARGURA - 2 * MARGEM - 9) / 4
  quadros.forEach(([rot, val, det], i) => {
    const x = MARGEM + i * (lq + 3)
    doc.setDrawColor(225); doc.setFillColor(248, 248, 248); doc.roundedRect(x, y, lq, 19, 2, 2, 'FD')
    doc.setFontSize(8); doc.setTextColor(110); doc.text(rot, x + 3, y + 5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20); doc.text(val, x + 3, y + 11.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(det, x + 3, y + 16)
  })
  y += 26

  // Tabela genérica: colunas = [{ t: título, w: largura, d: 'r' para alinhar à direita }]
  function tabela(titulo, colunas, linhas, total) {
    cabe(LINHA * 3 + 8)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20); doc.text(titulo, MARGEM, y + 3); y += 7
    const cabecalho = () => {
      doc.setFillColor(255, 106, 0); doc.rect(MARGEM, y, LARGURA - 2 * MARGEM, LINHA, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255)
      let x = MARGEM
      for (const c of colunas) { doc.text(c.t, c.d === 'r' ? x + c.w - 2 : x + 2, y + 4.3, c.d === 'r' ? { align: 'right' } : undefined); x += c.w }
      y += LINHA
    }
    const linha = (cels, negrito, i) => {
      if (y + LINHA > ALTURA - MARGEM) { pagina(); cabecalho() }
      if (negrito) { doc.setFillColor(238, 238, 238); doc.rect(MARGEM, y, LARGURA - 2 * MARGEM, LINHA, 'F') }
      else if (i % 2) { doc.setFillColor(250, 250, 250); doc.rect(MARGEM, y, LARGURA - 2 * MARGEM, LINHA, 'F') }
      doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.setTextColor(30)
      let x = MARGEM
      cels.forEach((v, k) => {
        const c = colunas[k]; const txt = doc.splitTextToSize(String(v ?? ''), c.w - 3)[0] || ''
        doc.text(txt, c.d === 'r' ? x + c.w - 2 : x + 2, y + 4.4, c.d === 'r' ? { align: 'right' } : undefined); x += c.w
      })
      y += LINHA
    }
    cabecalho()
    if (!linhas.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(120); doc.text('Nada no período.', MARGEM + 2, y + 4.4); y += LINHA }
    linhas.forEach((l, i) => linha(l, false, i))
    if (linhas.length && total) linha(total, true, 0)
    y += 7
  }

  tabela('Por operador — vendas e comissão', [
    { t: 'Operador', w: 63 }, { t: 'Reservas', w: 20, d: 'r' }, { t: 'Plataforma', w: 34, d: 'r' }, { t: 'Externas', w: 20, d: 'r' },
    { t: 'Por fora', w: 34, d: 'r' }, { t: 'Total vendido', w: 34, d: 'r' }, { t: 'Comissão devida', w: 34, d: 'r' }, { t: 'Paga', w: 17, d: 'r' }, { t: 'A pagar', w: 17, d: 'r' },
  ], rel.operadores.map((o) => [o.nome, o.reservas, moeda(o.vendido_plataforma), o.externas, moeda(o.vendido_externo), moeda(o.vendido_total), moeda(o.comissao_devida), moeda(o.comissao_paga).replace('R$', '').trim(), moeda(o.comissao_pendente).replace('R$', '').trim()]),
  ['Total', t.reservas, moeda(t.vendido_plataforma), t.externas, moeda(t.vendido_externo), moeda(t.vendido_total), moeda(t.comissao_devida), moeda(t.comissao_paga).replace('R$', '').trim(), moeda(t.comissao_pendente).replace('R$', '').trim()])

  tabela('Por executor — serviços e repasse', [
    { t: 'Executor', w: 80 }, { t: 'Função', w: 33 }, { t: 'Serviços', w: 25, d: 'r' }, { t: 'Repasse devido', w: 40, d: 'r' },
    { t: 'Pago', w: 35, d: 'r' }, { t: 'A pagar', w: 35, d: 'r' }, { t: 'Sem valor', w: 25, d: 'r' },
  ], rel.executores.map((e) => [e.nome, e.papel, e.servicos, moeda(e.repasse_devido), moeda(e.repasse_pago), moeda(e.repasse_pendente), e.sem_valor || '']),
  ['Total', '', t.servicos, moeda(t.repasse_devido), moeda(t.repasse_pago), moeda(t.repasse_pendente), t.sem_valor || ''])

  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140)
    doc.text(`Turiva · gerado em ${new Date().toLocaleString('pt-BR')}`, MARGEM, ALTURA - 5)
    doc.text(`${i}/${n}`, LARGURA - MARGEM, ALTURA - 5, { align: 'right' })
  }
  return doc
}
