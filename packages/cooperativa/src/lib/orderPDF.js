import { jsPDF } from 'jspdf'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const BRAND  = [255, 106, 0]   // #FF6A00
const DARK   = [30,  40,  50]
const GRAY   = [100, 110, 120]
const LGRAY  = [230, 232, 235]
const WHITE  = [255, 255, 255]

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  try { return format(new Date(dateStr + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) }
  catch { return dateStr }
}

function row(doc, y, label, value, labelX = 14, valueX = 80) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY)
  doc.text(label, labelX, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK)
  doc.text(String(value || '—'), valueX, y)
  return y + 6
}

function sectionTitle(doc, y, title) {
  doc.setFillColor(...LGRAY)
  doc.rect(14, y - 4, 182, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text(title.toUpperCase(), 16, y)
  return y + 7
}

export function generateOrderPDF(booking, form) {
  const doc       = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW     = doc.internal.pageSize.getWidth()
  const issueDate = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

  // ── Header ─────────────────────────────────────────
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, pageW, 28, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...WHITE)
  doc.text('GIRO JERI', 14, 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(255, 200, 150)
  doc.text('Passeios & Transfers — Jericoacoara, CE', 14, 20)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...WHITE)
  doc.text('ORDEM DE SERVIÇO', pageW - 14, 12, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(255, 220, 190)
  doc.text(`Nº ${booking.booking_code}`, pageW - 14, 19, { align: 'right' })
  doc.text(`Emitida em ${issueDate}`, pageW - 14, 24, { align: 'right' })

  let y = 38

  // ── Cliente ────────────────────────────────────────
  y = sectionTitle(doc, y, 'Dados do Cliente')
  y = row(doc, y, 'Nome:',     booking.users?.full_name)
  y = row(doc, y, 'Telefone:', booking.users?.phone)
  y += 2

  // ── Serviço ────────────────────────────────────────
  y = sectionTitle(doc, y, 'Dados do Serviço')
  const tipo = booking.service_type === 'tour' ? 'Passeio' : 'Transfer'
  const modo = booking.booking_mode === 'shared' ? 'Compartilhado' : 'Privativo'
  y = row(doc, y, 'Tipo:',         `${tipo} ${modo}`)
  y = row(doc, y, 'Data:',         fmtDate(booking.service_date))
  y = row(doc, y, 'Horário:',      booking.service_time ? booking.service_time.slice(0, 5) : '—')
  y = row(doc, y, 'Pessoas:',      booking.people_count ? `${booking.people_count} pessoa(s)` : '—')
  if (booking.pickup_place_name || booking.origin_text) {
    y = row(doc, y, 'Embarque:', booking.pickup_place_name || booking.origin_text)
  }
  if (booking.destination_place_name || booking.destination_text) {
    y = row(doc, y, 'Destino:', booking.destination_place_name || booking.destination_text)
  }
  y += 2

  // ── Veículo ────────────────────────────────────────
  y = sectionTitle(doc, y, 'Veículo / Motorista')
  const vehicle = form.real_vehicle_text
    || booking.booking_vehicles?.[0]?.vehicle_name_snapshot
    || '—'
  y = row(doc, y, 'Veículo:', vehicle)
  if (form.driver_phone) {
    y = row(doc, y, 'WhatsApp motorista:', form.driver_phone)
  }
  if (form.dispatch_notes) {
    y = row(doc, y, 'Obs. motorista:', form.dispatch_notes)
  }
  y += 2

  // ── Valor ──────────────────────────────────────────
  doc.setFillColor(...BRAND)
  doc.roundedRect(14, y - 2, 182, 12, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  doc.text('VALOR TOTAL:', 18, y + 5.5)
  doc.setFontSize(13)
  doc.text(fmt(booking.total_amount), pageW - 18, y + 6, { align: 'right' })
  y += 18

  // Pagamento
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Status pagamento: PAGO ✓', 14, y)
  y += 8

  // ── Assinaturas ────────────────────────────────────
  y = sectionTitle(doc, y, 'Assinaturas')
  y += 6

  const colW = 85
  doc.setDrawColor(...LGRAY)
  doc.setLineWidth(0.4)

  // Motorista
  doc.line(14, y, 14 + colW, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  doc.text('Motorista / Operador', 14 + colW / 2, y + 4, { align: 'center' })

  // Cliente
  doc.line(110, y, 110 + colW, y)
  doc.text('Cliente', 110 + colW / 2, y + 4, { align: 'center' })

  y += 16

  // ── Notas cliente ──────────────────────────────────
  if (booking.special_notes) {
    y = sectionTitle(doc, y, 'Observações do Cliente')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK)
    const lines = doc.splitTextToSize(booking.special_notes, 180)
    doc.text(lines, 14, y)
    y += lines.length * 5 + 4
  }

  // ── Footer ─────────────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 12
  doc.setFillColor(...LGRAY)
  doc.rect(0, footerY - 4, pageW, 16, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...GRAY)
  doc.text('Giro Jeri — Passeios & Transfers · Jericoacoara, CE', pageW / 2, footerY + 2, { align: 'center' })
  doc.text('Documento gerado automaticamente. Cancele com 24h de antecedência.', pageW / 2, footerY + 6, { align: 'center' })

  return doc
}

export function downloadOrderPDF(booking, form) {
  const doc = generateOrderPDF(booking, form)
  doc.save(`OS-${booking.booking_code}.pdf`)
}

export async function shareOrderPDF(booking, form, target = 'driver') {
  const doc  = generateOrderPDF(booking, form)
  const blob = doc.output('blob')
  const file = new File([blob], `OS-${booking.booking_code}.pdf`, { type: 'application/pdf' })

  // Web Share API (Android/iOS) — tenta compartilhar o arquivo diretamente
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Ordem de Serviço — ${booking.booking_code}`,
        text:  `OS Giro Jeri — ${booking.booking_code}`,
      })
      return 'shared'
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('share error', e)
      return 'aborted'
    }
  }

  // Fallback desktop: baixa o PDF e abre WhatsApp com texto
  doc.save(`OS-${booking.booking_code}.pdf`)

  const phone = target === 'driver'
    ? (form.driver_phone || '').replace(/\D/g, '')
    : (booking.users?.phone || '').replace(/\D/g, '')

  if (!phone) return 'no_phone'

  const intl = phone.startsWith('55') ? phone : `55${phone}`
  const msg  = target === 'driver'
    ? buildDriverMessage(booking, form)
    : buildClientMessage(booking, form)

  window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, '_blank')
  return 'downloaded'
}

function buildDriverMessage(booking, form) {
  const vehicle = form.real_vehicle_text || booking.booking_vehicles?.[0]?.vehicle_name_snapshot || '—'
  const dateStr = booking.service_date
    ? format(new Date(booking.service_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'
  return [
    `🚗 *DESPACHO — GIRO JERI*`,
    `📋 *OS Nº:* ${booking.booking_code}`,
    ``,
    `👤 *Cliente:* ${booking.users?.full_name || '—'}`,
    booking.users?.phone ? `📞 *Tel. cliente:* ${booking.users.phone}` : null,
    ``,
    `📅 *Data:* ${dateStr}${booking.service_time ? ` às ${booking.service_time.slice(0,5)}` : ''}`,
    `👥 *Pessoas:* ${booking.people_count || '—'}`,
    `🚙 *Veículo:* ${vehicle}`,
    `📍 *Embarque:* ${booking.pickup_place_name || booking.origin_text || '—'}`,
    (booking.destination_place_name || booking.destination_text)
      ? `🏁 *Destino:* ${booking.destination_place_name || booking.destination_text}` : null,
    ``,
    `💰 *Valor:* ${fmt(booking.total_amount)}`,
    form.dispatch_notes ? `\n📝 *Obs:* ${form.dispatch_notes}` : null,
    ``,
    `_A Ordem de Serviço em PDF foi enviada em anexo._`,
  ].filter(Boolean).join('\n')
}

function buildClientMessage(booking, form) {
  const vehicle = form.real_vehicle_text || booking.booking_vehicles?.[0]?.vehicle_name_snapshot || '—'
  const dateStr = booking.service_date
    ? format(new Date(booking.service_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR }) : '—'
  return [
    `🌴 *Olá, ${booking.users?.full_name?.split(' ')[0] || ''}! Sua reserva foi confirmada!*`,
    ``,
    `📋 *Código:* ${booking.booking_code}`,
    `📅 *Data:* ${dateStr}${booking.service_time ? ` às ${booking.service_time.slice(0,5)}` : ''}`,
    `👥 *Pessoas:* ${booking.people_count || '—'}`,
    `🚙 *Veículo:* ${vehicle}`,
    `📍 *Local de embarque:* ${booking.pickup_place_name || booking.origin_text || '—'}`,
    ``,
    `💰 *Valor:* ${fmt(booking.total_amount)} ✅ PAGO`,
    ``,
    `_Obrigado por escolher a Giro Jeri! Qualquer dúvida estamos à disposição._`,
    `_Sua Ordem de Serviço está em anexo._`,
  ].filter(Boolean).join('\n')
}
