// ── xlsx.js ─────────────────────────────────────────────
// Gera uma planilha .xlsx no navegador, sem biblioteca de planilha.
//
// Por que não usar SheetJS: a versão publicada no npm parou em 2022 e carrega
// CVEs de prototype pollution no caminho de LEITURA. Aqui só se escreve, então
// na prática não seriam exploráveis — mas trazer uma dependência de ~500 KB com
// vulnerabilidades conhecidas para montar cinco arquivos XML não se paga.
//
// Um .xlsx é um ZIP com XML dentro. O `fflate` (8 KB, mantido) faz o ZIP; o
// resto são cinco arquivos pequenos, gerados abaixo.

import { zipSync, strToU8 } from 'fflate'

// & < > são estrutura do XML. Os caracteres de controle (exceto tab, LF e CR)
// são PROIBIDOS em XML 1.0: um deles vindo de um nome cadastrado gera um
// arquivo que o Excel recusa a abrir, com uma mensagem que não diz o motivo.
function esc(v) {
  return String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 0 → A, 25 → Z, 26 → AA. O Excel rejeita a planilha inteira se uma única
// referência de célula estiver fora de ordem ou malformada.
function coluna(i) {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) {
    s = String.fromCharCode(65 + (n % 26)) + s
  }
  return s
}

// Estilos: 0 = normal, 1 = cabeçalho (negrito), 2 = moeda, 3 = negrito+moeda.
// numFmtId 164 é o primeiro id livre para formato personalizado — abaixo disso
// são os embutidos do Excel.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

/**
 * Uma célula pode ser um valor cru ou `{ v, tipo, estilo }`.
 *   tipo:   'n' número · 's' texto (padrão: número se for number)
 *   estilo: 0 normal · 1 cabeçalho · 2 moeda · 3 cabeçalho+moeda
 */
function celula(ref, c) {
  const obj  = (c && typeof c === 'object' && !Array.isArray(c)) ? c : { v: c }
  const { v, estilo = 0 } = obj
  if (v === null || v === undefined || v === '') {
    // Célula vazia COM estilo ainda precisa existir, senão a coluna perde a
    // formatação a partir dali.
    return estilo ? `<c r="${ref}" s="${estilo}"/>` : ''
  }
  const tipo = obj.tipo || (typeof v === 'number' ? 'n' : 's')
  if (tipo === 'n' && Number.isFinite(Number(v))) {
    return `<c r="${ref}" s="${estilo}"><v>${Number(v)}</v></c>`
  }
  // inlineStr evita a tabela de strings compartilhadas: um arquivo a menos e
  // nenhum índice para sair de sincronia.
  return `<c r="${ref}" t="inlineStr" s="${estilo}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
}

function planilha(linhas, larguras) {
  const cols = larguras?.length
    ? `<cols>${larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const corpo = linhas.map((linha, r) =>
    `<row r="${r + 1}">${(linha || []).map((c, i) => celula(`${coluna(i)}${r + 1}`, c)).join('')}</row>`
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${cols}<sheetData>${corpo}</sheetData></worksheet>`
}

// O Excel recusa abas com : \ / ? * [ ] ou mais de 31 caracteres.
function nomeAba(nome, i) {
  const limpo = String(nome || `Planilha${i + 1}`).replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
  return limpo || `Planilha${i + 1}`
}

/**
 * Monta o arquivo .xlsx.
 * @param {Array<{nome:string, linhas:Array<Array>, larguras?:number[]}>} abas
 * @returns {Blob}
 */
export function montarXlsx(abas) {
  const lista = (abas || []).filter(Boolean)
  if (lista.length === 0) throw new Error('Nada para exportar.')

  const arquivos = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${lista.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`),

    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),

    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${lista.map((a, i) => `<sheet name="${esc(nomeAba(a.nome, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`),

    // styles.xml entra DEPOIS das abas nos ids: rId1..N são as planilhas.
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${lista.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${lista.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),

    'xl/styles.xml': strToU8(STYLES),
  }

  lista.forEach((a, i) => {
    arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(planilha(a.linhas || [], a.larguras))
  })

  return new Blob([zipSync(arquivos)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/** Monta e dispara o download. */
export function baixarXlsx(nomeArquivo, abas) {
  const blob = montarXlsx(abas)
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = nomeArquivo.endsWith('.xlsx') ? nomeArquivo : `${nomeArquivo}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Sem revogar, o blob fica na memória até a aba fechar. O timeout existe
  // porque revogar na mesma volta do event loop cancela o download no Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
