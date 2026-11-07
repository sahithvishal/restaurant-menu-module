import { fmtDT } from './utils'

function header({ business, outlet, title, from, to, by }) {
  return [[business || ''], [`${title}`], [`Outlet: ${outlet || '-'}   Period: ${from || '-'} to ${to || '-'}`], [`Generated: ${fmtDT(new Date())}   By: ${by || ''}`], []]
}

export async function exportXlsx({ meta, columns, rows, totals, filename }) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Report')
  header(meta).forEach((r) => ws.addRow(r))
  ws.getRow(1).font = { bold: true, size: 14 }; ws.getRow(2).font = { bold: true }
  const hr = ws.addRow(columns.map((c) => c.label)); hr.font = { bold: true }
  rows.forEach((r) => ws.addRow(columns.map((c) => r[c.key] ?? '')))
  if (totals) { const tr = ws.addRow(columns.map((c, i) => (i === 0 ? 'Total' : totals[c.key] ?? ''))); tr.font = { bold: true } }
  columns.forEach((_, i) => { ws.getColumn(i + 1).width = 20 })
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = filename + '.xlsx'; a.click(); URL.revokeObjectURL(a.href)
}

export async function exportPdf({ meta, columns, rows, totals, filename }) {
  const jsPDF = (await import('jspdf')).default
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' })
  doc.setFontSize(14); doc.text(meta.business || '', 14, 15)
  doc.setFontSize(11); doc.text(meta.title, 14, 22)
  doc.setFontSize(9)
  doc.text(`Outlet: ${meta.outlet || '-'}   Period: ${meta.from || '-'} to ${meta.to || '-'}`, 14, 28)
  doc.text(`Generated: ${fmtDT(new Date())}   By: ${meta.by || ''}`, 14, 33)
  const body = rows.map((r) => columns.map((c) => String(r[c.key] ?? '')))
  if (totals) body.push(columns.map((c, i) => (i === 0 ? 'Total' : String(totals[c.key] ?? ''))))
  autoTable(doc, { startY: 38, head: [columns.map((c) => c.label)], body, styles: { fontSize: 8 }, headStyles: { fillColor: [20, 33, 28] } })
  doc.save(filename + '.pdf')
}
export const printPage = () => window.print()
