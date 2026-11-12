export type Cell = string | number | null | undefined

function escape(cell: Cell): string {
  const s = cell == null ? '' : String(cell)
  // Quote anything with a comma, quote or line break; a spreadsheet would otherwise split or merge it
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(escape).join(',')).join('\r\n')
}

/** Saves rows as a .csv file. A leading byte-order mark makes Excel read Chinese text correctly. */
export function downloadCsv(filename: string, rows: Cell[][]) {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Fils as a plain number for spreadsheets: 123456 -> "1234.56" (no thousands separators, no currency). */
export function plainAmount(fils: number): string {
  const abs = Math.abs(fils)
  return `${fils < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
