import type { TFunction } from 'i18next'
import { getDayExcelOn, listClosedDays } from '@/db/repo/backup'
import { loadDailyCtx } from '@/features/daily/useDailyData'
import { downloadBlob, xlsxBlob } from '@/lib/xlsx'
import { fillMissingDayExcel, makeBackup, saveDayExcel } from './backup'
import { daySheets } from './dayWorkbook'

/** The day's workbook, built from what is stored now. */
export async function dayWorkbook(date: string, t: TFunction, lang: 'en' | 'zh'): Promise<Blob> {
  return xlsxBlob(daySheets(await loadDailyCtx(date), t, lang))
}

export async function downloadDayExcel(date: string, t: TFunction, lang: 'en' | 'zh') {
  downloadBlob(`daybook-${date}.xlsx`, await dayWorkbook(date, t, lang))
}

/**
 * What closing a day leaves behind: a checked copy of the whole database and, unless switched off, the day as an
 * Excel workbook. A failure here never undoes the close; the backup status shows it instead.
 */
export async function backupClosedDay(date: string, t: TFunction, lang: 'en' | 'zh') {
  await makeBackup('dayClose', { ask: true }).catch(() => undefined)
  try {
    if (await getDayExcelOn()) {
      await saveDayExcel(date, await dayWorkbook(date, t, lang), { ask: false })
      await catchUpDayExcel(t, lang)
    }
  } catch {
    // the database backup above is the one that matters
  }
}

/** Writes the Excel copy of every closed day still missing from the folder (when the setting is on). */
export async function catchUpDayExcel(t: TFunction, lang: 'en' | 'zh'): Promise<number> {
  if (!(await getDayExcelOn())) return 0
  return fillMissingDayExcel(await listClosedDays(), (d) => dayWorkbook(d, t, lang))
}
