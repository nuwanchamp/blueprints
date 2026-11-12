import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const DAY = '2026-10-26'

async function fillMoney(page: Page, label: string, value: string) {
  const f = page.getByLabel(label, { exact: true })
  await f.fill(value)
  await f.blur()
}

async function setCashSale(page: Page, value: string) {
  await page.goto(`/daily?date=${DAY}&step=sales`)
  await expect(page.getByRole('heading', { name: 'Daily close' })).toBeVisible()
  await fillMoney(page, 'Amount: Cash', value)
  await expect(page.getByTestId('total-sales')).toHaveText(`AED ${value}`) // saved and counted, not only typed
}

/** Stands in for the folder picker: a folder inside the browser's private storage, which Playwright can't click through a real dialog for. */
async function fakeFolderPicker(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle('test-backups', { create: true })
  })
}

const sidebarStatus = (page: Page) => page.getByRole('complementary').first().getByTestId('backup-status')

test('backup downloads when no folder is chosen, and restoring it brings the data back', async ({ page }) => {
  await setCashSale(page, '3,420.00')
  await expect(sidebarStatus(page)).toHaveText('No backup yet')
  await expect(sidebarStatus(page)).toHaveAttribute('data-health', 'none')

  await page.goto('/settings/backup')
  await expect(page.getByText('No folder chosen yet')).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Backup now' }).click()])
  expect(download.suggestedFilename()).toMatch(/^daybook-\d{4}-\d{2}-\d{2}-\d{6}\.sqlite3$/)
  await expect(page.getByRole('status').filter({ hasText: 'Backup downloaded' })).toBeVisible()
  await expect(sidebarStatus(page)).toContainText('Last backup:')
  await expect(sidebarStatus(page)).toHaveAttribute('data-health', 'ok')
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 15).toString()).toBe('SQLite format 3')

  // change the data after the backup
  await setCashSale(page, '999.00')

  // restore: check the file first, then replace (a safety copy downloads before anything changes)
  await page.goto('/settings/backup')
  await page.locator('input[type=file]').setInputFiles({ name: 'daybook-backup.sqlite3', mimeType: 'application/vnd.sqlite3', buffer: bytes })
  const preview = page.getByTestId('restore-preview')
  await expect(preview).toContainText('1 sales, 0 expenses, 0 cash movements')
  await expect(preview).toContainText('Restoring replaces all data')
  const [safety] = await Promise.all([page.waitForEvent('download'), preview.getByRole('button', { name: 'Restore this backup' }).click()])
  expect(safety.suggestedFilename()).toMatch(/-before-restore\.sqlite3$/)
  await expect(page.getByRole('status').filter({ hasText: 'Restored daybook-backup.sqlite3' })).toBeVisible()

  await page.goto(`/daily?date=${DAY}&step=sales`)
  await expect(page.getByLabel('Amount: Cash', { exact: true })).toHaveValue('3,420.00')
})

test('a file that is not a Daybook backup is refused and nothing changes', async ({ page }) => {
  await setCashSale(page, '120.00')
  await page.goto('/settings/backup')
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.sqlite3', mimeType: 'application/octet-stream', buffer: Buffer.from('not a database at all, just some text that is long enough '.repeat(4)) })
  await expect(page.getByRole('alert')).toHaveText('This is not a Daybook backup file.')
  await expect(page.getByTestId('restore-preview')).toHaveCount(0)
  await setCashSale(page, '120.00') // still there
})

test('with a folder chosen, backups are saved into it and listed for restore', async ({ page }) => {
  await fakeFolderPicker(page)
  await setCashSale(page, '75.00')
  await page.goto('/settings/backup')
  await page.getByRole('button', { name: 'Choose folder' }).click()
  await expect(page.getByTestId('backup-folder')).toHaveText('test-backups')

  await page.getByRole('button', { name: 'Backup now' }).click()
  await expect(page.getByRole('status').filter({ hasText: /Backup saved: daybook-.*\.sqlite3 in test-backups/ })).toBeVisible()
  await expect(sidebarStatus(page)).toContainText('Last backup:')

  const list = page.getByRole('list', { name: 'Backups in the folder' })
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await list.getByRole('button', { name: /^Check: daybook-/ }).click()
  await expect(page.getByTestId('restore-preview')).toContainText('1 sales')

  // the folder is remembered after a reload
  await page.reload()
  await expect(page.getByTestId('backup-folder')).toHaveText('test-backups')
})

test('closing a day makes a backup', async ({ page }) => {
  await fakeFolderPicker(page)
  await page.goto('/settings/backup')
  await page.getByRole('button', { name: 'Choose folder' }).click()
  await expect(page.getByTestId('backup-folder')).toHaveText('test-backups')

  await setCashSale(page, '1,000.00')
  await fillMoney(page, 'Opening float', '500')
  await page.goto(`/daily?date=${DAY}&step=cash`)
  await fillMoney(page, 'Counted cash', '1500')
  await page.goto(`/daily?date=${DAY}&step=review`)
  await page.getByRole('button', { name: 'Close day' }).click()
  await expect(page.getByText('This day is closed').first()).toBeVisible()
  await expect(sidebarStatus(page)).toContainText('Last backup:')

  // the day's Excel copy sits next to the database backup, in excel/
  const xlsx = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const dir = await (await root.getDirectoryHandle('test-backups')).getDirectoryHandle('excel')
    const f = await (await dir.getFileHandle('daybook-2026-10-26.xlsx')).getFile()
    return Array.from(new Uint8Array(await f.arrayBuffer()))
  })
  const { Workbook } = (await import('exceljs')).default
  const book = new Workbook()
  await book.xlsx.load(Buffer.from(xlsx))
  expect(book.worksheets.map((w) => w.name)).toEqual(['Summary', 'Sales', 'Discounts', 'Expenses', 'Cash movements'])
  const summary = book.getWorksheet('Summary')!
  const value = (label: string) => summary.getColumn(1).values.indexOf(label)
  expect(summary.getRow(value('Status')).getCell(2).value).toBe('Closed')
  expect(summary.getRow(value('Total sales')).getCell(2).value).toBe(1000)
  expect(summary.getRow(value('Expected in drawer')).getCell(2).value).toBe(1500)
  expect(summary.getRow(value('Counted cash')).getCell(2).value).toBe(1500)
  // channel, as received, tips, sales after tips
  expect(book.getWorksheet('Sales')!.getRow(2).values).toEqual([undefined, 'Dine in › Cash', 1000, 0, 1000])

  await page.goto('/settings/backup')
  await expect(page.getByRole('list', { name: 'Backups in the folder' }).getByRole('listitem')).toHaveCount(1)
  await page.getByRole('button', { name: /^Check: daybook-/ }).click()
  await expect(page.getByTestId('restore-preview')).toContainText('26/10/2026') // last closed day
})

test('any day can be downloaded as an Excel workbook from Review & close', async ({ page }) => {
  await setCashSale(page, '250.00')
  await page.goto(`/daily?date=${DAY}&step=review`)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download day as Excel' }).click()])
  expect(download.suggestedFilename()).toBe('daybook-2026-10-26.xlsx')
  const { Workbook } = (await import('exceljs')).default
  const book = new Workbook()
  await book.xlsx.readFile((await download.path())!)
  const summary = book.getWorksheet('Summary')!
  expect(summary.getRow(1).font?.bold).toBe(true)
  expect(summary.getRow(3).values).toEqual([undefined, 'Status', 'Open'])
  expect(book.getWorksheet('Sales')!.rowCount).toBe(2)
})

test('Backup now adds the Excel copy of days closed before a folder was chosen', async ({ page }) => {
  await fakeFolderPicker(page)
  await setCashSale(page, '1,000.00')
  await fillMoney(page, 'Opening float', '500')
  await page.goto(`/daily?date=${DAY}&step=cash`)
  await fillMoney(page, 'Counted cash', '1500')
  await page.goto(`/daily?date=${DAY}&step=review`)
  await page.getByRole('button', { name: 'Close day' }).click() // no folder yet: these copies download
  await expect(page.getByText('This day is closed').first()).toBeVisible()

  await page.goto('/settings/backup')
  await page.getByRole('button', { name: 'Choose folder' }).click()
  await page.getByRole('button', { name: 'Backup now' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Excel copy added for 1 closed day.' })).toBeVisible()
  const names = await page.evaluate(async () => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('test-backups')).getDirectoryHandle('excel')
    const out: string[] = []
    for await (const e of (dir as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) out.push(e.name)
    return out
  })
  expect(names).toEqual(['daybook-2026-10-26.xlsx'])

  // a second backup finds nothing missing
  await page.getByRole('button', { name: 'Backup now' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Backup saved: .*test-backups\.$/ })).toBeVisible()
})

test('a folder that leaves files empty is caught: the backup downloads instead and the page says why', async ({ page }) => {
  await fakeFolderPicker(page)
  // Imitates Google Drive opened through the Files app: the write "succeeds" but the file stays empty
  await page.addInitScript(() => {
    FileSystemWritableFileStream.prototype.write = async function () {}
  })
  await setCashSale(page, '40.00')
  await page.goto('/settings/backup')
  await page.getByRole('button', { name: 'Choose folder' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Backup now' }).click()])
  expect(download.suggestedFilename()).toMatch(/^daybook-.*\.sqlite3$/)
  await expect(page.getByRole('status').filter({ hasText: "The backup folder didn't keep the file" })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: "This folder doesn't store files correctly" })).toBeVisible()
  await expect(sidebarStatus(page)).toHaveAttribute('data-health', 'old')
})
