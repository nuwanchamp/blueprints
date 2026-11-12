import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bookmarkPages } from '../electron/pdfOutline'

const DAY = '2026-10-26'

/** Starts the built desktop app with its own data and backup folders, as a fresh install would. */
async function launch(dataDir: string, backupDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  // DAYBOOK_EXE runs the packaged app (e.g. release/linux-unpacked/daybook) instead of the project folder
  const exe = process.env.DAYBOOK_EXE
  const app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: ['.'] }),
    env: { ...process.env, DAYBOOK_SPLASH_MS: '0', DAYBOOK_USER_DATA: dataDir, DAYBOOK_TEST_PICK_FOLDER: backupDir, DAYBOOK_DEFAULT_BACKUPS: join(dataDir, 'Daybook Backups') },
  })
  const page = await mainWindow(app)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  return { app, page }
}

/** The app's own window (the first one to open is the loading screen). */
async function mainWindow(app: ElectronApplication): Promise<Page> {
  const isMain = (w: Page) => w.url().startsWith('app://daybook/') && !w.url().includes('splash.html')
  await expect.poll(() => app.windows().some(isMain), { timeout: 20_000 }).toBe(true)
  return app.windows().find(isMain)!
}

async function setCashSale(page: Page, value: string) {
  await page.goto(`app://daybook/daily?date=${DAY}&step=sales`)
  const f = page.getByLabel('Amount: Cash', { exact: true })
  await f.fill(value)
  await f.blur()
  await expect(page.getByTestId('total-sales')).toHaveText(`AED ${value}`)
}

test('data is a file on disk and survives closing and reopening the app', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'daybook-data-'))
  const backupDir = mkdtempSync(join(tmpdir(), 'daybook-backups-'))

  let { app, page } = await launch(dataDir, backupDir)
  await expect(page.getByText(/nothing is saved/i)).toHaveCount(0) // not the in-memory fallback
  await setCashSale(page, '3,420.00')
  await app.close()
  expect(readFileSync(join(dataDir, 'daybook.sqlite3')).subarray(0, 15).toString()).toBe('SQLite format 3')
  ;({ app, page } = await launch(dataDir, backupDir))
  await page.goto(`app://daybook/daily?date=${DAY}&step=sales`)
  await expect(page.getByLabel('Amount: Cash', { exact: true })).toHaveValue('3,420.00')
  await app.close()
})

test('backups go to the chosen folder, closing the app adds one, and a backup restores', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'daybook-data-'))
  const backupDir = mkdtempSync(join(tmpdir(), 'daybook-backups-'))
  let { app, page } = await launch(dataDir, backupDir)
  await setCashSale(page, '500.00')

  await page.goto('app://daybook/settings/backup')
  await expect(page.getByTestId('data-file')).toHaveText(join(dataDir, 'daybook.sqlite3'))
  // a fresh install already backs up into a default folder; the person can pick another
  await expect(page.getByTestId('backup-folder')).toHaveText('Daybook Backups')
  await page.getByRole('button', { name: 'Change folder' }).click()
  await expect(page.getByTestId('backup-folder')).toHaveText(/daybook-backups-/)
  await page.getByRole('button', { name: 'Backup now' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Backup saved: daybook-.*\.sqlite3 in daybook-backups-/ })).toBeVisible()
  const first = readdirSync(join(backupDir, 'database')).filter((n) => n.endsWith('.sqlite3'))
  expect(first).toHaveLength(1)

  // change the figure, then close: the app leaves a backup of the newer data
  await setCashSale(page, '750.00')
  await app.close()
  const after = readdirSync(join(backupDir, 'database')).filter((n) => n.endsWith('.sqlite3'))
  expect(after.some((n) => n.endsWith('-on-close.sqlite3'))).toBe(true)

  // restore the first backup from the folder list: the earlier figure comes back
  ;({ app, page } = await launch(dataDir, backupDir))
  await page.goto('app://daybook/settings/backup')
  await expect(page.getByRole('main').getByTestId('backup-status')).toContainText('Last backup:')
  await page.getByRole('button', { name: `Check: ${first[0]}` }).click()
  await expect(page.getByTestId('restore-preview')).toContainText('1 sales')
  await page.getByTestId('restore-preview').getByRole('button', { name: 'Restore this backup' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Restored ${first[0]}` })).toBeVisible()
  await page.goto(`app://daybook/daily?date=${DAY}&step=sales`)
  await expect(page.getByLabel('Amount: Cash', { exact: true })).toHaveValue('500.00')
  // the safety copy taken before the restore is in the folder too
  expect(readdirSync(join(backupDir, 'database')).some((n) => n.endsWith('-before-restore.sqlite3'))).toBe(true)
  await app.close()
  expect(existsSync(join(dataDir, 'daybook.sqlite3'))).toBe(true)
})

test('a loading screen with the animated logo shows first, then the app takes its place', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'daybook-data-'))
  const app = await electron.launch({ args: ['.'], env: { ...process.env, DAYBOOK_USER_DATA: dataDir, DAYBOOK_SPLASH_MS: '1500' } })
  const isSplash = (w: Page) => w.url().includes('splash.html')
  await expect.poll(() => app.windows().some(isSplash)).toBe(true)
  const splash = app.windows().find(isSplash)!
  await expect(splash.locator('#logo svg')).toBeVisible() // the logo is drawn inline, so its animation can be set to play once
  const splashWin = await app.browserWindow(splash)
  expect(await splashWin.evaluate((w) => w.isVisible())).toBe(true)

  const page = await mainWindow(app)
  const mainWin = await app.browserWindow(page)
  await expect.poll(() => mainWin.evaluate((w) => w.isVisible()), { timeout: 15_000 }).toBe(true)
  await expect.poll(() => app.windows().length).toBe(1) // the loading screen is gone
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await app.close()
})

test('the Updates page shows the version, and downloading or installing without the admin PIN is refused', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'daybook-data-'))
  const backupDir = mkdtempSync(join(tmpdir(), 'daybook-backups-'))
  const { app, page } = await launch(dataDir, backupDir)
  await page.goto('app://daybook/settings/updates')
  await expect(page.getByRole('region', { name: 'Updates' })).toContainText('This computer has version')
  // A development build never goes online for updates
  await expect(page.getByText(/updates are switched off/i)).toBeVisible()
  const refused = await page.evaluate(async () => {
    const u = window.daybookNative!.update
    const out: string[] = []
    for (const job of [() => u.download('made-up'), () => u.install('made-up')]) {
      try {
        await job()
        out.push('allowed')
      } catch {
        out.push('refused')
      }
    }
    return out
  })
  expect(refused).toEqual(['refused', 'refused'])
  await app.close()
})

/** Changes the database version number from outside the app, as an older or newer Daybook would leave it. */
async function setDataVersion(app: ElectronApplication, file: string, change: (v: number) => number): Promise<number> {
  return app.evaluate(({}, [f, body]) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')
    const d = new DatabaseSync(f)
    const v = Number((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
    const next = (new Function('v', `return (${body})(v)`) as (v: number) => number)(v)
    d.exec(`PRAGMA user_version = ${next}`)
    d.close()
    return v
  }, [file, change.toString()] as const)
}

test('data from a newer Daybook is refused with a screen that can still install an update', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'daybook-data-'))
  const backupDir = mkdtempSync(join(tmpdir(), 'daybook-backups-'))
  let { app, page } = await launch(dataDir, backupDir)
  const file = join(dataDir, 'daybook.sqlite3')
  await setDataVersion(app, file, (v) => v + 50)
  await app.close()
  const before = readFileSync(file)

  ;({ app, page } = await launch(dataDir, backupDir))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Daybook can't open its data")
  await expect(page.getByText(/saved by a newer version of Daybook/)).toBeVisible()
  await expect(page.getByText(/This computer has version/)).toBeVisible()
  await app.close()
  // Nothing wrote to the file, not even the close-time backup's record
  expect(readFileSync(file).equals(before)).toBe(true)
})

test('before upgrade steps run a copy is saved, and a failed upgrade leaves the data as it was', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'daybook-data-'))
  const backupDir = mkdtempSync(join(tmpdir(), 'daybook-backups-'))
  let { app, page } = await launch(dataDir, backupDir)
  const file = join(dataDir, 'daybook.sqlite3')
  // One version back: the last step runs again and fails, because its table is already there
  const latest = await setDataVersion(app, file, (v) => v - 1)
  await app.close()

  ;({ app, page } = await launch(dataDir, backupDir))
  await expect(page.getByText(/couldn't upgrade the data/)).toBeVisible()
  await app.close()
  const copies = readdirSync(join(dataDir, 'before-upgrade'))
  expect(copies).toHaveLength(1)
  expect(copies[0]).toMatch(new RegExp(`^daybook-.*-from-v${latest - 1}\\.sqlite3$`))
  // The failed step was rolled back: the data still says the version it had
  ;({ app } = await launch(dataDir, backupDir))
  expect(await setDataVersion(app, file, (v) => v)).toBe(latest - 1)
  await app.close()
})

test('old backups are thinned out after a new one, and the rules can only change with the admin PIN', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'daybook-data-'))
  const backupDir = mkdtempSync(join(tmpdir(), 'daybook-backups-'))
  const db = join(backupDir, 'database')
  mkdirSync(db, { recursive: true })
  // Three backups a day for 60 days, a month or two ago, plus a file that isn't a Daybook backup
  const pad = (n: number) => String(n).padStart(2, '0')
  for (let d = 30; d < 90; d++) {
    for (const h of [9, 15, 22]) {
      const t = new Date(Date.now() - d * 864e5)
      const name = `daybook-${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}-${pad(h)}0000-on-close`
      writeFileSync(join(db, `${name}.sqlite3`), 'old')
      writeFileSync(join(db, `${name}.json`), '{}')
    }
  }
  writeFileSync(join(db, 'my-own-copy.sqlite3'), 'keep me')

  const { app, page } = await launch(dataDir, backupDir)
  await page.goto('app://daybook/settings/backup')
  await page.getByRole('button', { name: 'Change folder' }).click()
  await page.getByRole('button', { name: 'Backup now' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Backup saved/ })).toBeVisible()
  const left = readdirSync(db)
  // One a day for the old ones (60), except that the newest 10 backups always stay: the new one plus all three of
  // each of the three most recent old days (6 more). Each keeps its note.
  expect(left.filter((n) => n.endsWith('-on-close.sqlite3'))).toHaveLength(66)
  expect(left.filter((n) => n.endsWith('-on-close.json'))).toHaveLength(66)
  expect(left).toContain('my-own-copy.sqlite3')
  await expect(page.getByRole('region', { name: 'Keeping old backups' })).toContainText(/Every backup\s*14 days/)

  const refused = await page.evaluate(() =>
    window.daybookNative!.backup.setRetention('made-up', { keepAllDays: 7 }).then(
      () => 'allowed',
      () => 'refused',
    ),
  )
  expect(refused).toBe('refused')
  await app.close()
})

test('reports have separate Print and Save as PDF; the PDF holds the whole report with a contents page', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'daybook-data-'))
  const pdfDir = mkdtempSync(join(tmpdir(), 'daybook-pdf-'))
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, DAYBOOK_SPLASH_MS: '0', DAYBOOK_USER_DATA: dataDir, DAYBOOK_DEFAULT_BACKUPS: join(dataDir, 'b'), DAYBOOK_TEST_SAVE_PDF: pdfDir },
  })
  const page = await mainWindow(app)
  await page.goto('app://daybook/reports?tab=summary&range=custom&from=2026-10-01&to=2026-10-31')
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save as PDF' }).click()
  const file = join(pdfDir, 'daybook-report-2026-10-01_2026-10-31.pdf')
  await expect(page.getByRole('status').filter({ hasText: `Saved: ${file}` })).toBeVisible()
  const bytes = readFileSync(file)
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  // Every section is in it, each from a new page after the contents page, and bookmarked
  const pages = [...bookmarkPages(new Uint8Array(bytes))]
  const start = (h: string) => pages.find(([title]) => title.startsWith(h))?.[1]
  expect(start('1. Summary')).toBe(2)
  expect(start('2. Sales')).toBeGreaterThan(start('1. Summary')!)
  expect(start('3. Expenses')).toBeGreaterThan(start('2. Sales')!)
  expect(start('4. Daily log')).toBeGreaterThan(start('3. Expenses')!)
  // …and the screen is back to the one tab that was open
  await expect(page.getByRole('tabpanel', { name: 'Summary' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open PDF' })).toBeVisible()
  // Open PDF opens only what the app saved itself, never another path the page names
  expect(await page.evaluate(() => window.daybookNative!.pdf.open('/etc/hostname'))).toBe('Not a PDF saved here')
  await app.close()
})
