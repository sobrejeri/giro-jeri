import { jsPDF } from 'jspdf'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ── Paleta ─────────────────────────────────────────────
const BRAND  = [255, 106,  0]
const DARK   = [15,  15,  15]
const GRAY   = [90,  90,  90]
const LGRAY  = [200, 200, 200]
const XLGRAY = [240, 240, 240]
const WHITE  = [255, 255, 255]

const fmtMoney = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function fmtDate(s) {
  if (!s) return '—'
  try { return format(new Date(s + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) } catch { return s }
}
function fmtDateLong(s) {
  if (!s) return '—'
  try { return format(new Date(s + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) } catch { return s }
}

// ── Carrega imagem remota como base64 ──────────────────
async function fetchBase64(url) {
  if (!url) return null
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

// ── Helpers de desenho ─────────────────────────────────
function sectionTitle(doc, text, x, y, w) {
  doc.setFillColor(...XLGRAY)
  doc.rect(x, y - 4.5, w, 8, 'F')
  doc.setDrawColor(...LGRAY)
  doc.setLineWidth(0.25)
  doc.rect(x, y - 4.5, w, 8, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY)
  doc.text(text, x + 4, y)
  return y + 7
}

function hline(doc, x, y, w) {
  doc.setDrawColor(...LGRAY)
  doc.setLineWidth(0.25)
  doc.line(x, y, x + w, y)
}

function dataField(doc, label, value, x, y, maxW) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  doc.text(label, x, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...DARK)
  const lines = doc.splitTextToSize(String(value || '—'), maxW)
  doc.text(lines, x, y + 5)
  return y + 5 + lines.length * 4.5
}

// ── Gerador principal (síncrono — logo já em base64) ───
export function generateOrderPDF(booking, form, cooperativa = null) {
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M     = 18
  const CW    = pageW - M * 2
  const COL   = pageW / 2

  const issued   = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const dateStr  = fmtDate(booking.service_date)
  const dateLong = fmtDateLong(booking.service_date)
  const timeStr  = booking.service_time ? booking.service_time.slice(0, 5) : '—'
  const origin   = booking.pickup_place_name      || booking.origin_text       || '—'
  const dest     = booking.destination_place_name || booking.destination_text  || '—'
  const vehicle  = form.real_vehicle_text || booking.booking_vehicles?.[0]?.vehicle_name_snapshot || '—'
  const tipo     = booking.service_type === 'tour'    ? 'Passeio'       : 'Transfer'
  const modo     = booking.booking_mode  === 'shared' ? 'Compartilhado' : 'Privativo'
  const colW2    = CW / 2 - 4

  const coopName    = cooperativa?.full_name      || 'Giro Jeri Passeios & Transfers'
  const coopCNPJ    = cooperativa?.document_number
  const coopPhone   = cooperativa?.phone
  const coopLogoB64 = cooperativa?.logoBase64 || null

  let y = 0

  // ── Cabeçalho branco — Cooperativa ────────────────────
  const HEADER_H = 38
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, pageW, HEADER_H, 'F')

  // Borda laranja lateral esquerda
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, 4, HEADER_H, 'F')

  const LOGO_SZ  = 28  // tamanho do logo/placeholder
  const LOGO_X   = 10
  const LOGO_Y   = 5
  const TEXT_X   = LOGO_X + LOGO_SZ + 5

  if (coopLogoB64) {
    // Logo carregado como base64
    try {
      doc.addImage(coopLogoB64, 'PNG', LOGO_X, LOGO_Y, LOGO_SZ, LOGO_SZ)
    } catch {
      drawLogoPlaceholder(doc, coopName, LOGO_X, LOGO_Y, LOGO_SZ)
    }
  } else {
    drawLogoPlaceholder(doc, coopName, LOGO_X, LOGO_Y, LOGO_SZ)
  }

  // Nome da cooperativa
  const availW = COL - TEXT_X - 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...DARK)
  const nameLines = doc.splitTextToSize(coopName.toUpperCase(), availW)
  doc.text(nameLines, TEXT_X, 14)

  let infoY = 14 + nameLines.length * 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)

  if (coopCNPJ) {
    const docLabel = cooperativa?.document_type === 'cnpj' ? 'CNPJ' : 'CPF'
    doc.text(`${docLabel}: ${coopCNPJ}`, TEXT_X, infoY)
    infoY += 5
  }
  if (coopPhone) {
    doc.text(`Tel: ${coopPhone}`, TEXT_X, infoY)
    infoY += 5
  }
  doc.text('Jericoacoara — CE', TEXT_X, infoY)

  // OS info (lado direito)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY)
  doc.text('ORDEM DE SERVIÇO', pageW - M, 10, { align: 'right' })

  doc.setFontSize(16)
  doc.setTextColor(...BRAND)
  doc.text(`Nº ${booking.booking_code}`, pageW - M, 20, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  doc.text(`Emitida em ${issued}`, pageW - M, 27, { align: 'right' })

  // Borda inferior do cabeçalho
  doc.setDrawColor(...LGRAY)
  doc.setLineWidth(0.3)
  doc.line(0, HEADER_H, pageW, HEADER_H)

  // ── Faixa laranja — subtítulo ─────────────────────────
  doc.setFillColor(...BRAND)
  doc.rect(0, HEADER_H, pageW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...WHITE)
  doc.text('GIRO JERI — PLATAFORMA DE PASSEIOS & TRANSFERS · JERICOACOARA, CE', pageW / 2, HEADER_H + 5.5, { align: 'center' })

  y = HEADER_H + 16

  // ── 1. DADOS DO VEÍCULO / MOTORISTA ───────────────────
  y = sectionTitle(doc, '1. DADOS DO VEÍCULO / MOTORISTA', M, y, CW)
  y += 2

  dataField(doc, 'VEÍCULO (MODELO / PLACA / COR):', vehicle, M, y, colW2)
  if (form.driver_name) {
    dataField(doc, 'NOME DO MOTORISTA:', form.driver_name, COL + 2, y, colW2)
  }
  y += 14

  if (form.driver_phone) {
    dataField(doc, 'WHATSAPP DO MOTORISTA:', form.driver_phone, M, y, colW2)
    y += 12
  }

  hline(doc, M, y, CW)
  y += 8

  // ── 2. DADOS DO SERVIÇO ────────────────────────────────
  y = sectionTitle(doc, '2. DADOS DO SERVIÇO', M, y, CW)
  y += 2

  dataField(doc, 'TIPO DE SERVIÇO:', `${tipo} — ${modo}`, M, y, colW2)
  dataField(doc, 'DATA DO SERVIÇO:', dateLong, COL + 2, y, colW2)
  y += 14

  dataField(doc, 'Nº DE PASSAGEIROS:', `${booking.people_count || '—'} pessoa(s)`, M, y, colW2)
  if (booking.service_time) {
    dataField(doc, 'HORÁRIO DE SAÍDA:', `${timeStr}hs`, COL + 2, y, colW2)
  }
  y += 14

  // Caixa SAÍDA / DATA
  doc.setFillColor(...XLGRAY)
  doc.roundedRect(M, y, CW, 13, 1.5, 1.5, 'F')
  doc.setDrawColor(...LGRAY)
  doc.setLineWidth(0.3)
  doc.roundedRect(M, y, CW, 13, 1.5, 1.5, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text(`SAÍDA: ${timeStr}hs`, COL - 15, y + 8.5, { align: 'right' })
  doc.setTextColor(...LGRAY)
  doc.text('|', COL, y + 8.5, { align: 'center' })
  doc.setTextColor(...DARK)
  doc.text(`DATA: ${dateStr}`, COL + 15, y + 8.5, { align: 'left' })
  y += 19

  // Tabela Partida / Chegada
  const tH   = 9.5
  const labW = 52

  doc.setFillColor(...XLGRAY)
  doc.rect(M, y, labW, tH, 'F')
  doc.setFillColor(...WHITE)
  doc.rect(M + labW, y, CW - labW, tH, 'F')
  doc.setDrawColor(...LGRAY)
  doc.setLineWidth(0.3)
  doc.rect(M, y, CW, tH, 'S')
  doc.line(M + labW, y, M + labW, y + tH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY)
  doc.text('Destino da Partida:', M + 3, y + 6.2)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text(origin.toUpperCase(), M + labW + 5, y + 6.2)
  y += tH

  doc.setFillColor(...XLGRAY)
  doc.rect(M, y, labW, tH, 'F')
  doc.setFillColor(...WHITE)
  doc.rect(M + labW, y, CW - labW, tH, 'F')
  doc.setDrawColor(...LGRAY)
  doc.rect(M, y, CW, tH, 'S')
  doc.line(M + labW, y, M + labW, y + tH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY)
  doc.text('Destino da Chegada:', M + 3, y + 6.2)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text(dest.toUpperCase(), M + labW + 5, y + 6.2)
  y += tH + 8

  // ── 3. DADOS DO CLIENTE ────────────────────────────────
  y = sectionTitle(doc, '3. DADOS DO CLIENTE', M, y, CW)
  y += 2

  dataField(doc, 'NOME:', booking.users?.full_name || '—', M, y, colW2)
  if (booking.users?.phone) {
    dataField(doc, 'TELEFONE / WHATSAPP:', booking.users.phone, COL + 2, y, colW2)
  }
  y += 14
  hline(doc, M, y, CW)
  y += 8

  // ── 4. LISTAGEM DE PASSAGEIROS ─────────────────────────
  y = sectionTitle(doc, '4. LISTAGEM DE PASSAGEIROS', M, y, CW)
  y += 2

  const pCols = [CW * 0.62, CW * 0.38]
  const pRowH = 9

  doc.setFillColor(210, 210, 210)
  doc.rect(M, y, CW, pRowH, 'F')
  doc.setDrawColor(...LGRAY)
  doc.setLineWidth(0.3)
  doc.rect(M, y, CW, pRowH, 'S')
  doc.line(M + pCols[0], y, M + pCols[0], y + pRowH)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('NOME COMPLETO DO PASSAGEIRO', M + 4, y + 6)
  doc.text('DOCUMENTO', M + pCols[0] + 4, y + 6)
  y += pRowH

  const rowCount = Math.max(Number(booking.people_count || 1), 5)
  for (let i = 0; i < rowCount; i++) {
    const bg = i % 2 === 0 ? WHITE : [252, 252, 252]
    doc.setFillColor(...bg)
    doc.rect(M, y, CW, pRowH, 'F')
    doc.setDrawColor(...LGRAY)
    doc.rect(M, y, CW, pRowH, 'S')
    doc.line(M + pCols[0], y, M + pCols[0], y + pRowH)
    if (i === 0 && booking.users?.full_name) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...DARK)
      doc.text(booking.users.full_name.toUpperCase(), M + 4, y + 6.2)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(40, 120, 40)
      doc.text('APRESENTAR', M + pCols[0] + 4, y + 6.2)
    }
    y += pRowH
  }
  y += 8

  // ── 5. OBSERVAÇÕES ─────────────────────────────────────
  const notes = [form.dispatch_notes, booking.special_notes].filter(Boolean).join(' | ')
  if (notes) {
    y = sectionTitle(doc, '5. OBSERVAÇÕES', M, y, CW)
    y += 2
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...DARK)
    const noteLines = doc.splitTextToSize(notes, CW - 8)
    const noteBoxH  = noteLines.length * 5 + 7
    doc.setFillColor(255, 253, 235)
    doc.setDrawColor(220, 190, 80)
    doc.setLineWidth(0.3)
    doc.rect(M, y - 3, CW, noteBoxH, 'F')
    doc.rect(M, y - 3, CW, noteBoxH, 'S')
    doc.text(noteLines, M + 4, y + 1.5)
    y += noteBoxH + 6
  }

  // ── 6. VALOR TOTAL ─────────────────────────────────────
  doc.setFillColor(...BRAND)
  doc.roundedRect(M, y, CW, 14, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...WHITE)
  doc.text('VALOR TOTAL:', M + 6, y + 9)
  doc.setFontSize(14)
  doc.text(fmtMoney(booking.total_amount), pageW - M - 4, y + 9.5, { align: 'right' })
  y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(50, 130, 50)
  doc.text('✓  PAGAMENTO CONFIRMADO', M + 4, y + 5)
  y += 14

  // ── Assinaturas ────────────────────────────────────────
  const sigTop = Math.max(y + 4, pageH - 44)
  const sigW   = 72
  const sig1X  = M + 6
  const sig2X  = pageW - M - sigW - 6

  doc.setDrawColor(...GRAY)
  doc.setLineWidth(0.4)

  doc.line(sig1X, sigTop, sig1X + sigW, sigTop)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Assinatura do Motorista / Operador', sig1X + sigW / 2, sigTop + 5, { align: 'center' })
  if (form.driver_name) {
    doc.setFontSize(7)
    doc.setTextColor(...DARK)
    doc.text(form.driver_name.toUpperCase(), sig1X + sigW / 2, sigTop + 9.5, { align: 'center' })
  }

  doc.line(sig2X, sigTop, sig2X + sigW, sigTop)
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Assinatura do Cliente', sig2X + sigW / 2, sigTop + 5, { align: 'center' })
  if (booking.users?.full_name) {
    doc.setFontSize(7)
    doc.setTextColor(...DARK)
    doc.text(booking.users.full_name.toUpperCase(), sig2X + sigW / 2, sigTop + 9.5, { align: 'center' })
  }

  // ── Rodapé ─────────────────────────────────────────────
  const footY = pageH - 10
  doc.setFillColor(...BRAND)
  doc.rect(0, footY - 5, pageW, 15, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...WHITE)
  doc.text(
    'Giro Jeri — Plataforma de Passeios & Transfers · Jericoacoara, CE · Documento gerado automaticamente',
    pageW / 2, footY + 2, { align: 'center' }
  )

  return doc
}

// ── Placeholder de logo (iniciais em caixa) ────────────
function drawLogoPlaceholder(doc, name, x, y, size) {
  const initials = (name || 'GJ')
    .split(/[\s-]+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('')

  doc.setFillColor(...BRAND)
  doc.roundedRect(x, y, size, size, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(size * 0.45)
  doc.setTextColor(...WHITE)
  doc.text(initials, x + size / 2, y + size * 0.62, { align: 'center' })
}

// ── Exportações públicas (assíncronas — carregam logo) ──
export async function downloadOrderPDF(booking, form, cooperativa = null) {
  const enriched = await _enrichWithLogo(cooperativa)
  generateOrderPDF(booking, form, enriched).save(`OS-${booking.booking_code}.pdf`)
}

export async function shareOrderPDF(booking, form, target = 'driver', cooperativa = null) {
  const enriched = await _enrichWithLogo(cooperativa)
  const doc      = generateOrderPDF(booking, form, enriched)
  const blob     = doc.output('blob')
  const file     = new File([blob], `OS-${booking.booking_code}.pdf`, { type: 'application/pdf' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `OS — ${booking.booking_code}`, text: `OS Giro Jeri — ${booking.booking_code}` })
      return 'shared'
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('share error', e)
      return 'aborted'
    }
  }

  doc.save(`OS-${booking.booking_code}.pdf`)

  const phone = target === 'driver'
    ? (form.driver_phone || '').replace(/\D/g, '')
    : (booking.users?.phone || '').replace(/\D/g, '')

  if (!phone) return 'no_phone'

  const intl = phone.startsWith('55') ? phone : `55${phone}`
  const msg  = target === 'driver' ? buildDriverMessage(booking, form) : buildClientMessage(booking, form)
  window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, '_blank')
  return 'downloaded'
}

async function _enrichWithLogo(cooperativa) {
  if (!cooperativa) return null
  const logoBase64 = await fetchBase64(cooperativa.profile_photo_url)
  return { ...cooperativa, logoBase64 }
}

function buildDriverMessage(booking, form) {
  const vehicle = form.real_vehicle_text || booking.booking_vehicles?.[0]?.vehicle_name_snapshot || '—'
  const dateStr = booking.service_date
    ? format(new Date(booking.service_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'
  const timeStr = booking.service_time ? booking.service_time.slice(0, 5) : '—'
  const origin  = booking.pickup_place_name      || booking.origin_text       || '—'
  const dest    = booking.destination_place_name || booking.destination_text  || '—'

  return [
    `🚗 *ORDEM DE SERVIÇO — GIRO JERI*`,
    `📋 *OS Nº:* ${booking.booking_code}`,
    ``,
    `👤 *Cliente:* ${booking.users?.full_name || '—'}`,
    booking.users?.phone ? `📞 *Tel. cliente:* ${booking.users.phone}` : null,
    ``,
    `📅 *Data:* ${dateStr} às ${timeStr}hs`,
    `👥 *Passageiros:* ${booking.people_count || '—'}`,
    `🚙 *Veículo:* ${vehicle}`,
    `📍 *Partida:* ${origin}`,
    dest !== '—' ? `🏁 *Chegada:* ${dest}` : null,
    ``,
    `💰 *Valor:* ${fmtMoney(booking.total_amount)} ✅`,
    form.dispatch_notes ? `\n📝 *Obs:* ${form.dispatch_notes}` : null,
    ``,
    `_A Ordem de Serviço em PDF foi enviada em anexo._`,
  ].filter(Boolean).join('\n')
}

function buildClientMessage(booking, form) {
  const vehicle = form.real_vehicle_text || booking.booking_vehicles?.[0]?.vehicle_name_snapshot || '—'
  const dateStr = booking.service_date
    ? format(new Date(booking.service_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR }) : '—'
  const timeStr = booking.service_time ? booking.service_time.slice(0, 5) : '—'
  const origin  = booking.pickup_place_name || booking.origin_text || '—'

  return [
    `🌴 *Olá, ${booking.users?.full_name?.split(' ')[0] || ''}! Sua reserva está confirmada!*`,
    ``,
    `📋 *Código:* ${booking.booking_code}`,
    `📅 *Data:* ${dateStr} às ${timeStr}hs`,
    `👥 *Pessoas:* ${booking.people_count || '—'}`,
    `🚙 *Veículo:* ${vehicle}`,
    form.driver_name  ? `👨‍✈️ *Motorista:* ${form.driver_name}`     : null,
    form.driver_phone ? `📞 *Tel. motorista:* ${form.driver_phone}` : null,
    `📍 *Local de embarque:* ${origin}`,
    ``,
    `💰 *Valor:* ${fmtMoney(booking.total_amount)} ✅ PAGO`,
    ``,
    `_Obrigado por escolher a Giro Jeri! Qualquer dúvida estamos à disposição._`,
    `_Sua Ordem de Serviço está em anexo._`,
  ].filter(Boolean).join('\n')
}
