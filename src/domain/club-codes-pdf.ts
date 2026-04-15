import { jsPDF } from 'jspdf'

interface ClubCodePdfEntry {
  label: string
  code: string
  url: string
  qrDataUrl: string
}

interface BuildClubCodesPdfOptions {
  tournamentName: string
  entries: ClubCodePdfEntry[]
}

export function buildClubCodesPdf({ tournamentName, entries }: BuildClubCodesPdfOptions): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageCenter = 105
  const maxTextWidth = 180
  entries.forEach((entry, index) => {
    if (index > 0) doc.addPage()
    doc.setFontSize(16)
    doc.text(doc.splitTextToSize(tournamentName, maxTextWidth), pageCenter, 30, {
      align: 'center',
    })
    doc.text(doc.splitTextToSize(entry.label, maxTextWidth), pageCenter, 50, {
      align: 'center',
    })
    doc.addImage(entry.qrDataUrl, 'PNG', 55, 70, 100, 100)
    doc.text('Om du blir ombedd att ange kod:', pageCenter, 185, { align: 'center' })
    doc.text(entry.code, pageCenter, 200, { align: 'center' })
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize(entry.url, maxTextWidth), pageCenter, 220, {
      align: 'center',
    })
  })
  return doc
}
