import type { Cell } from './csv'

/** "1234.56" is an amount from plainAmount: store it as a number so the sheet can add it up. */
const AMOUNT = /^-?(0|[1-9]\d*)\.\d{2}$/

export interface Sheet {
  name: string
  rows: Cell[][]
}

/** Builds an .xlsx file: header row in bold and frozen, amounts as real numbers, columns sized to their text. */
export async function xlsxBlob(sheets: Sheet[]): Promise<Blob> {
  // Loaded on first use, so the pages do not carry the spreadsheet library
  const { Workbook } = await import('exceljs')
  const book = new Workbook()
  for (const s of sheets) {
    const sheet = book.addWorksheet(s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
    s.rows.forEach((r, i) => {
      const row = sheet.addRow(r.map((c) => (typeof c === 'string' && AMOUNT.test(c) ? Number(c) : (c ?? ''))))
      // amounts like 1234.00 parse to whole numbers, so format every cell that came from an amount string
      r.forEach((c, j) => {
        if (typeof c === 'string' && AMOUNT.test(c)) row.getCell(j + 1).numFmt = '#,##0.00'
      })
      if (i === 0) row.font = { bold: true }
    })
    sheet.columns.forEach((col, j) => {
      const longest = Math.max(...s.rows.map((r) => String(r[j] ?? '').length), 8)
      col.width = Math.min(longest + 2, 50)
    })
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
  }
  const buffer = await book.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Saves rows as a one-sheet .xlsx file. */
export async function downloadXlsx(filename: string, rows: Cell[][], sheetName = 'Daybook') {
  downloadBlob(filename, await xlsxBlob([{ name: sheetName, rows }]))
}
