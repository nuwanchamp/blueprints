import { expect, test, type Page } from '@playwright/test'

/**
 * Hand-worked figures for the seeded days (all amounts in AED):
 *
 *  2025-12-31 closed  sales 500.00   expenses  50.00 (uncategorised)         counted = expected
 *  2026-09-15 closed  sales 1,000.00 expenses 400.00                        counted = expected
 *  2026-10-01 closed  sales 1,700.00 (Cash 1,000, Visa 500, Talabat 200)    expenses 800.00, counted 10.00 short
 *  2026-10-02 closed  sales 2,300.00 (Cash 2,000, Keeta 300)  discount 100  expenses 100.00, counted = expected
 *  2026-10-03 OPEN    sales   999.00
 *
 *  This month (1-26 Oct, closed only): sales 4,000.00, expenses 900.00, profit 3,100.00, margin 77.5%, discounts 100.00
 */

async function seed(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-26T10:00:00'))
  await page.goto('/settings/expense-categories') // opens the database
  await expect(page.getByRole('heading', { name: 'Expense categories' })).toBeVisible()
  await page.evaluate(async () => {
    const { query } = await import('/src/db/client.ts')
    const d = await import('/src/db/repo/daily.ts')
    const id = async (table: string, name: string) => Number((await query(`SELECT id FROM ${table} WHERE name_en = ?`, [name]))[0].id)
    type Day = { date: string; opening?: number; sales: [string, number][]; expenses?: [string, string | null, string, number][]; discounts?: [string, number][]; counted?: number; close?: boolean }
    const run = async (day: Day) => {
      if (day.opening !== undefined) await d.setOpeningFloat(day.date, day.opening)
      for (const [ch, fils] of day.sales) await d.saveSale(day.date, await id('income_channel', ch), fils)
      for (const [supplier, cat, acct, fils] of day.expenses ?? []) {
        await d.saveExpense({ date: day.date, categoryId: cat ? await id('expense_category', cat) : null, paidFromId: await id('paid_from_account', acct), amountFils: fils, supplier, reference: '', note: '' })
      }
      for (const [reason, fils] of day.discounts ?? []) await d.saveDiscount({ date: day.date, reasonId: await id('discount_reason', reason), amountFils: fils, note: '' })
      if (day.counted !== undefined) await d.setCountedCash(day.date, day.counted)
      if (day.close) await d.closeDay(day.date)
    }
    await run({ date: '2025-12-31', opening: 0, sales: [['Cash', 50000]], expenses: [['Al Wafa', null, 'Cash drawer', 5000]], counted: 45000, close: true })
    await run({ date: '2026-09-15', opening: 0, sales: [['Cash', 100000]], expenses: [['Al Wafa', 'Vegetables & fruit', 'Cash drawer', 40000]], counted: 60000, close: true })
    await run({
      date: '2026-10-01',
      opening: 0,
      sales: [['Cash', 100000], ['Visa', 50000], ['Talabat', 20000]],
      expenses: [['Live Sea food', 'Meat & seafood', 'Cash drawer', 30000], ['Landlord', 'Rent', 'Bank account', 50000]],
      counted: 69000, // expected 1,000 - 300 = 700.00, so 10.00 short
      close: true,
    })
    await run({
      date: '2026-10-02',
      opening: 0,
      sales: [['Cash', 200000], ['Keeta', 30000]],
      discounts: [['Promotion', 10000]],
      expenses: [['Al Wafa', 'Vegetables & fruit', 'Cash drawer', 10000]],
      counted: 190000,
      close: true,
    })
    await run({ date: '2026-10-03', opening: 0, sales: [['Cash', 99900]] }) // still open
  })
}

const openDashboard = async (page: Page, query = '') => {
  await seed(page)
  await page.goto(`/dashboard${query}`)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

test('dashboard: this month, closed days only, with the figures worked out by hand', async ({ page }) => {
  await openDashboard(page)
  await expect(page.getByTestId('period-text')).toHaveText('01/10/2026 – 26/10/2026')
  await expect(page.getByTestId('kpi-sales')).toHaveText('AED 4,000.00')
  await expect(page.getByTestId('kpi-expenses')).toHaveText('AED 900.00')
  await expect(page.getByTestId('kpi-profit')).toHaveText('AED 3,100.00')
  await expect(page.getByText('77.5% of sales')).toBeVisible()
  await expect(page.getByTestId('kpi-discounts')).toHaveText('AED 100.00')
  await expect(page.getByText('Sales before discounts: AED 4,100.00')).toBeVisible()
  await expect(page.getByTestId('kpi-cash')).toHaveText('− AED 10.00')
  await expect(page.getByTestId('kpi-days')).toHaveText('2')
  // compared with the 26 days before (5-30 Sep): sales 1,000.00 -> 4,000.00, profit 600.00 -> 3,100.00
  await expect(page.getByText('+300.0% vs the previous 26 days')).toBeVisible()
  await expect(page.getByText('+416.7% vs the previous 26 days')).toBeVisible()
  await page.screenshot({ path: 'e2e/shots/dashboard.png', fullPage: true })
})

test('dashboard: a day still open is not counted, says so, and can be included', async ({ page }) => {
  await openDashboard(page)
  const notice = page.getByRole('status', { name: 'Before you rely on these numbers' })
  await expect(notice).toContainText('1 day in this period is still open, so it is not counted.')
  await expect(notice).not.toContainText('no category') // October has none; only the 2025 expense is uncategorised
  await page.getByRole('button', { name: 'Include them' }).click()
  await expect(page).toHaveURL(/open=1/)
  await expect(page.getByTestId('kpi-sales')).toHaveText('AED 4,999.00')
  await expect(page.getByTestId('kpi-profit')).toHaveText('AED 4,099.00')
  await expect(page.getByTestId('kpi-days')).toHaveText('3')
  await expect(notice).toHaveCount(0) // nothing left to warn about
  await expect(page.getByLabel('Include days not yet closed')).toBeChecked()
})

test('periods: last month, this year, last year and a custom range', async ({ page }) => {
  await openDashboard(page)
  const pick = (name: string) => page.getByRole('radio', { name, exact: true }).click()

  await pick('Last month')
  await expect(page.getByTestId('period-text')).toHaveText('01/09/2026 – 30/09/2026')
  await expect(page.getByTestId('kpi-sales')).toHaveText('AED 1,000.00')
  await expect(page.getByTestId('kpi-profit')).toHaveText('AED 600.00')

  await pick('This year')
  await expect(page.getByTestId('kpi-sales')).toHaveText('AED 5,000.00') // September + October
  await expect(page.getByTestId('kpi-expenses')).toHaveText('AED 1,300.00')

  await pick('Last year')
  await expect(page.getByTestId('period-text')).toHaveText('01/01/2025 – 31/12/2025')
  await expect(page.getByTestId('kpi-sales')).toHaveText('AED 500.00')
  await expect(page.getByTestId('kpi-profit')).toHaveText('AED 450.00')
  await expect(page.getByRole('status', { name: 'Before you rely on these numbers' })).toContainText('1 expense has no category yet.')

  await pick('Custom')
  await page.getByLabel('From', { exact: true }).fill('2026-09-01')
  await page.getByLabel('To', { exact: true }).fill('2026-10-31')
  await expect(page.getByTestId('kpi-sales')).toHaveText('AED 5,000.00')
  await expect(page.getByTestId('period-text')).toHaveText('01/09/2026 – 31/10/2026')

  await pick('Today')
  await expect(page.getByText('No closed days in this period yet.').first()).toBeVisible()
})

const RED = 'rgb(179, 38, 30)'
const INK_RGB = 'rgb(21, 20, 19)'

/** Aug 10: sales 100.00, rent 400.00 -> a loss of 300.00. Aug 11: sales 500.00, nothing spent -> a profit of 500.00. */
async function seedLossAndProfit(page: Page) {
  await seed(page)
  await page.evaluate(async () => {
    const { query } = await import('/src/db/client.ts')
    const d = await import('/src/db/repo/daily.ts')
    const cash = Number((await query("SELECT id FROM income_channel WHERE name_en = 'Cash'"))[0].id)
    const acct = Number((await query("SELECT id FROM paid_from_account WHERE name_en = 'Bank account'"))[0].id)
    const cat = Number((await query("SELECT id FROM expense_category WHERE name_en = 'Rent'"))[0].id)
    await d.setOpeningFloat('2026-08-10', 0)
    await d.saveSale('2026-08-10', cash, 10000)
    await d.saveExpense({ date: '2026-08-10', categoryId: cat, paidFromId: acct, amountFils: 40000, supplier: 'Landlord', reference: '', note: '' })
    await d.setCountedCash('2026-08-10', 10000)
    await d.closeDay('2026-08-10')
    await d.setOpeningFloat('2026-08-11', 0)
    await d.saveSale('2026-08-11', cash, 50000)
    await d.setCountedCash('2026-08-11', 50000)
    await d.closeDay('2026-08-11')
  })
}

test('a loss is shown as a loss: the word, the minus sign and red', async ({ page }) => {
  await seedLossAndProfit(page)
  await page.goto('/dashboard?range=custom&from=2026-08-10&to=2026-08-10')
  const hero = page.getByTestId('kpi-profit')
  await expect(hero).toHaveText('− AED 300.00') // the minus sign and amount say it without colour
  await expect(hero).toHaveCSS('color', RED)
  await expect(hero.locator('..')).toContainText('Loss') // and so does the label
  await expect(hero.locator('..')).not.toContainText('Profit')
  await expect(hero.locator('..')).toHaveCSS('border-top-color', RED)
  await page.getByRole('button', { name: 'View as table' }).last().click()
  await expect(page.getByRole('table').last()).toContainText('− AED 300.00')
  await expect(page.getByRole('table').last().getByRole('cell', { name: '− AED 300.00' })).toHaveCSS('color', RED)

  // a profit is not red
  await page.goto('/dashboard?range=custom&from=2026-08-11&to=2026-08-11')
  await expect(page.getByTestId('kpi-profit')).toHaveText('AED 500.00')
  await expect(page.getByTestId('kpi-profit')).toHaveCSS('color', INK_RGB)
  const tile = page.getByTestId('kpi-profit').locator('..')
  await expect(tile).toContainText('Profit')
  await expect(tile).not.toContainText('Loss')
})

test('profit / loss chart: profit bars are ink, loss bars are red, and the legend says so', async ({ page }) => {
  await seedLossAndProfit(page)
  await page.goto('/dashboard?range=custom&from=2026-08-10&to=2026-08-11')
  await expect(page.getByTestId('kpi-profit')).toHaveText('AED 200.00') // the two days net to a profit, so the headline is not red
  await expect(page.getByTestId('kpi-profit')).toHaveCSS('color', INK_RGB)
  const chart = page.getByRole('img', { name: 'Profit / loss' })
  await expect(chart.locator('path[fill="#b3261e"]')).toHaveCount(1) // 10 Aug, below the line
  await expect(chart.locator('path[fill="#151413"]')).toHaveCount(1) // 11 Aug, above it
  const card = page.getByRole('region', { name: 'Profit / loss' })
  await expect(card.getByRole('listitem').filter({ hasText: 'Loss' })).toBeVisible()
  await expect(card.getByRole('listitem').filter({ hasText: 'Profit' })).toBeVisible()

  // the tooltip names it
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
  const tip = page.locator('.recharts-tooltip-wrapper').nth(1)
  await expect(tip).toContainText('Loss')
  await expect(tip).toContainText('− AED 300.00')
  await page.screenshot({ path: 'e2e/shots/loss-chart.png', fullPage: true })
})

test('reports show a loss in red too, in the summary and the daily log', async ({ page }) => {
  await seedLossAndProfit(page)
  await page.goto('/reports?tab=summary&range=custom&from=2026-08-10&to=2026-08-11&by=day')
  const summary = page.getByRole('table', { name: 'Summary' })
  await expect(summary.getByRole('row', { name: /10 Aug/ }).getByRole('cell', { name: '− AED 300.00' })).toHaveCSS('color', RED)
  await expect(summary.getByRole('row', { name: /11 Aug/ }).getByRole('cell', { name: 'AED 500.00' }).last()).toHaveCSS('color', INK_RGB)
  await page.goto('/reports?tab=days&range=custom&from=2026-08-10&to=2026-08-11')
  const log = page.getByRole('table', { name: 'Daily log' })
  await expect(log.getByRole('row', { name: /10\/08\/2026/ }).getByRole('cell', { name: '− AED 300.00' })).toHaveCSS('color', RED)
})

test('dashboard charts: sales vs expenses, profit, and where it came from', async ({ page }) => {
  await openDashboard(page)
  const trend = page.getByRole('img', { name: 'Sales and expenses' })
  await expect(trend).toBeVisible()
  // a legend for the two series, and bars drawn in the brand ink and the hatch
  await expect(page.getByRole('listitem').filter({ hasText: /^Sales$/ }).first()).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: /^Expenses$/ }).first()).toBeVisible()
  await expect(trend.locator('path[fill="#151413"]')).toHaveCount(2) // two closed days
  await expect(trend.locator('path[fill="url(#hatch-expenses)"]')).toHaveCount(2)

  // hovering shows every value for that day, with the value first
  await trend.scrollIntoViewIfNeeded()
  const box = (await trend.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5)
  const tip = page.locator('.recharts-tooltip-wrapper').first()
  await expect(tip).toContainText('AED 1,700.00')
  await expect(tip).toContainText('AED 800.00')
  await expect(tip).toContainText('AED 900.00')

  // ranked bars carry their values as text, so nothing needs hovering
  const channels = page.getByRole('region', { name: 'Sales by channel' })
  await expect(channels).toContainText('Cash')
  await expect(channels).toContainText('AED 3,000.00')
  await expect(channels).toContainText('75.0%')
  const cats = page.getByRole('region', { name: 'Expenses by category' })
  await expect(cats).toContainText('Premises')
  await expect(cats).toContainText('AED 500.00')
  await expect(cats).toContainText('Food & beverage')
  await expect(cats).toContainText('AED 400.00')

  // a category bar is split by sub-category, each part named with its amount under the bar
  const food = cats.getByRole('listitem').filter({ hasText: 'Food & beverage' }).first()
  await expect(food.getByTestId('bar-segment')).toHaveCount(2)
  await expect(food).toContainText('Meat & seafood AED 300.00')
  await expect(food).toContainText('Vegetables & fruit AED 100.00')
  await expect(food.getByTestId('bar-segment').first()).toHaveAttribute('title', 'Meat & seafood: AED 300.00')
  await page.screenshot({ path: 'e2e/shots/split-bars.png', fullPage: true })

  // every chart has a table twin
  await page.getByRole('button', { name: 'View as table' }).first().click()
  const table = page.getByRole('region', { name: 'Sales and expenses' }).getByRole('table')
  await expect(table).toContainText('1 Oct')
  await expect(table).toContainText('AED 2,300.00')
})

test('reports - summary: by day, month and year, with totals that match the dashboard', async ({ page }) => {
  await seed(page)
  await page.goto('/reports?range=thisYear')
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible()
  // this year defaults to months
  const table = page.getByRole('table', { name: 'Summary' })
  await expect(table.getByRole('row', { name: /Sep(t)? 2026/ })).toContainText('AED 1,000.00')
  await expect(table.getByRole('row', { name: /Oct 2026/ })).toContainText('AED 4,000.00')
  await expect(table.getByRole('row', { name: /Oct 2026/ })).toContainText('AED 3,100.00')
  await expect(table.getByRole('row', { name: /Oct 2026/ })).toContainText('77.5%')
  await expect(table.locator('tfoot')).toContainText('AED 5,000.00')
  await expect(table.locator('tfoot')).toContainText('AED 3,700.00') // profit: 600 + 3,100

  await page.getByRole('radio', { name: 'Day', exact: true }).click()
  await expect(table.getByRole('row')).toHaveCount(1 + 3 + 1) // header, three closed days, total
  await expect(table.getByRole('row', { name: /2 Oct/ })).toContainText('AED 2,300.00')

  await page.getByRole('radio', { name: 'Year', exact: true }).click()
  await expect(table.getByRole('row', { name: /^2026/ })).toContainText('AED 5,000.00')
})

test('reports - sales: by channel as a tree, every sale by day, and discounts by reason', async ({ page }) => {
  await seed(page)
  await page.goto('/reports?tab=sales&range=thisMonth')
  const byChannel = page.getByRole('table', { name: 'Sales by channel' })
  await expect(byChannel.getByRole('row', { name: /^Dine in/ })).toContainText('AED 3,500.00') // Cash 3,000 + Visa 500
  await expect(byChannel.getByRole('row', { name: /^Card/ })).toContainText('AED 500.00')
  await expect(byChannel.getByRole('row', { name: /^Visa/ })).toContainText('AED 500.00')
  await expect(byChannel.getByRole('row', { name: /^Delivery/ })).toContainText('AED 500.00') // Talabat 200 + Keeta 300
  await expect(byChannel.getByRole('row', { name: /^Cash/ })).toContainText('75.0%')
  await expect(byChannel.locator('tfoot')).toContainText('AED 4,000.00')

  // each sale: one row per day, one column per channel that had sales
  const matrix = page.getByRole('table', { name: 'Each sale, by day and channel' })
  const oct1 = matrix.getByRole('row', { name: /01\/10\/2026/ })
  await expect(oct1).toContainText('AED 1,000.00') // Cash
  await expect(oct1).toContainText('AED 500.00') // Visa
  await expect(oct1).toContainText('AED 200.00') // Talabat
  await expect(oct1.getByRole('cell').last()).toHaveText('AED 1,700.00')
  const oct2 = matrix.getByRole('row', { name: /02\/10\/2026/ })
  await expect(oct2).toContainText('AED 100.00') // the discount
  await expect(oct2.getByRole('cell').last()).toHaveText('AED 2,300.00')
  await expect(matrix.getByRole('columnheader', { name: 'Keeta' })).toBeVisible()
  await expect(matrix.getByRole('columnheader', { name: 'Mastercard' })).toHaveCount(0) // no sales, no column
  await expect(matrix.locator('tfoot')).toContainText('AED 4,000.00')

  const discounts = page.getByRole('table', { name: 'Discounts by reason' })
  await expect(discounts.getByRole('row', { name: /Promotion/ })).toContainText('AED 100.00')
  await page.screenshot({ path: 'e2e/shots/report-sales.png', fullPage: true })
})

test('reports - expenses: by account, by market, and every expense', async ({ page }) => {
  await seed(page)
  await page.goto('/reports?tab=expenses&range=thisMonth')
  const accounts = page.getByRole('table', { name: 'Expenses by paid-from account' })
  await expect(accounts.getByRole('row', { name: /Cash drawer/ })).toContainText('AED 400.00')
  await expect(accounts.getByRole('row', { name: /Bank account/ })).toContainText('AED 500.00')

  const markets = page.getByRole('table', { name: 'Where the money goes' })
  await expect(markets.getByRole('row').nth(1)).toContainText('Landlord') // biggest first
  await expect(markets.getByRole('row', { name: /Al Wafa/ })).toContainText('AED 100.00')

  const every = page.getByRole('table', { name: 'Every expense' })
  await expect(every.getByRole('row', { name: /01\/10\/2026/ })).toContainText('AED 800.00') // the day's total
  // days start folded; the day heading says how many items it holds
  await expect(every.getByRole('row', { name: /Live Sea food/ })).toHaveCount(0)
  await expect(every.getByRole('row', { name: /01\/10\/2026/ })).toContainText('2 items')
  await every.getByRole('button', { name: /01\/10\/2026/ }).click()
  await expect(every.getByRole('row', { name: /Live Sea food/ })).toContainText('Meat & seafood')
  await page.getByRole('region', { name: 'Every expense' }).getByRole('button', { name: 'Expand all' }).click()
  await expect(every.getByRole('row', { name: /Landlord/ })).toContainText('Bank account')
  await expect(every.getByRole('row', { name: /02\/10\/2026/ })).toContainText('AED 100.00')

  await page.screenshot({ path: 'e2e/shots/report-expenses.png', fullPage: true })
})

test('reports - daily log: each day, its cash count and the difference', async ({ page }) => {
  await seed(page)
  await page.goto('/reports?tab=days&range=thisMonth')
  const log = page.getByRole('table', { name: 'Daily log' })
  const oct1 = log.getByRole('row', { name: /01\/10\/2026/ })
  await expect(oct1).toContainText('Closed')
  await expect(oct1).toContainText('AED 1,700.00') // sales
  await expect(oct1).toContainText('AED 800.00') // expenses
  await expect(oct1).toContainText('AED 900.00') // profit
  await expect(oct1).toContainText('AED 700.00') // expected cash
  await expect(oct1).toContainText('AED 690.00') // counted
  await expect(oct1).toContainText('− AED 10.00') // difference
  await expect(log.getByRole('row', { name: /02\/10\/2026/ })).toContainText('AED 0.00') // counted = expected
  await expect(log.getByRole('row', { name: /03\/10\/2026/ })).toHaveCount(0) // open: not counted

  await page.getByLabel('Include days not yet closed').check()
  await expect(log.getByRole('row', { name: /03\/10\/2026/ })).toContainText('Open')
  await expect(log.getByRole('row', { name: /03\/10\/2026/ })).toContainText('AED 999.00')

  // a date opens that day
  await log.getByRole('link', { name: '01/10/2026' }).click()
  await expect(page).toHaveURL(/\/daily\?date=2026-10-01&step=review/)
})

test('export: CSV files hold plain numbers a spreadsheet can add up', async ({ page }) => {
  await seed(page)
  await page.goto('/reports?tab=summary&range=thisMonth')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).first().click()])
  expect(download.suggestedFilename()).toBe('daybook-summary-2026-10-01_2026-10-26.csv')
  const text = await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8')
  const lines = text.replace(/^﻿/, '').split('\r\n')
  expect(lines[0]).toBe('Period,Days,Sales,Card tips,Discounts given,Sales before discounts,Expenses,Profit / loss,Margin')
  expect(lines).toContain('2026-10-01,1,1700.00,0.00,0.00,1700.00,800.00,900.00,52.9')
  expect(lines).toContain('2026-10-02,1,2300.00,0.00,100.00,2400.00,100.00,2200.00,95.7')
  expect(lines[lines.length - 1]).toBe('Total,2,4000.00,0.00,100.00,4100.00,900.00,3100.00,77.5')
})

test('export: Excel files hold real numbers in a bold header row', async ({ page }) => {
  await seed(page)
  await page.goto('/reports?tab=summary&range=thisMonth')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Excel' }).first().click()])
  expect(download.suggestedFilename()).toBe('daybook-summary-2026-10-01_2026-10-26.xlsx')
  const { Workbook } = (await import('exceljs')).default
  const book = new Workbook()
  await book.xlsx.readFile((await download.path())!)
  const sheet = book.worksheets[0]
  expect(sheet.getRow(1).getCell(1).value).toBe('Period')
  expect(sheet.getRow(1).font?.bold).toBe(true)
  const first = sheet.getRow(2)
  expect(first.getCell(1).value).toBe('2026-10-01')
  expect(first.getCell(3).value).toBe(1700)
  expect(sheet.getRow(sheet.rowCount).getCell(8).value).toBe(3100)
})

test('Chinese UI: labels, names and dates switch; the numbers do not', async ({ page }) => {
  await openDashboard(page)
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('heading', { name: '总览' })).toBeVisible()
  await expect(page.getByTestId('period-text')).toHaveText('2026年10月1日 – 2026年10月26日')
  await expect(page.getByTestId('kpi-profit')).toHaveText('AED 3,100.00')
  await expect(page.getByText('盈利', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('此期间有 1 天尚未结账，因此未计入。')).toBeVisible()
  await expect(page.getByRole('region', { name: '各渠道销售' })).toContainText('现金')
  await page.goto('/reports?tab=expenses&range=thisMonth')
  const zhDrill = page.getByRole('table', { name: '按大类统计支出' })
  await expect(zhDrill.getByRole('button', { name: '食材饮品' })).toBeVisible()
  await expect(zhDrill.getByRole('row', { name: /食材饮品/ })).toContainText('AED 400.00')
  await zhDrill.getByRole('button', { name: '食材饮品' }).click()
  await expect(zhDrill.getByRole('button', { name: '肉类海鲜' })).toBeVisible()
})

test('tablet width: no sideways scrolling of the page, wide tables scroll inside their card', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 900, height: 1100 })
  for (const url of ['/dashboard', '/reports?tab=sales', '/reports?tab=days', '/reports?tab=expenses']) {
    await page.goto(url)
    await expect(page.getByTestId('period-text')).toBeVisible()
    await page.waitForTimeout(300)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, url).toBeLessThanOrEqual(1)
  }
})

test('printing: the screen chrome is dropped and the period is printed in the page', async ({ page }) => {
  await seed(page)
  await page.goto('/reports?range=lastMonth')
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  await expect(page.getByRole('group', { name: 'Language' })).toBeHidden()
  await expect(page.getByRole('radiogroup', { name: 'Period' })).toBeHidden()
  await expect(page.getByText('Daybook · Reports · 01/09/2026 – 30/09/2026 · Closed days only')).toBeVisible()
})

test('a custom range stays valid when one end is moved past the other', async ({ page }) => {
  await seed(page)
  await page.goto('/dashboard?range=lastYear')
  await page.getByRole('radio', { name: 'Custom', exact: true }).click()
  await page.getByLabel('From', { exact: true }).fill('2026-09-01') // later than the "to" it started with (31/12/2025)
  await expect(page.getByTestId('period-text')).toHaveText('01/09/2026 – 01/09/2026') // the other end came along
  await page.getByLabel('To', { exact: true }).fill('2026-10-31')
  await expect(page.getByTestId('period-text')).toHaveText('01/09/2026 – 31/10/2026')
  await expect(page.getByTestId('kpi-sales')).toHaveText('AED 5,000.00')
  await page.getByLabel('To', { exact: true }).fill('2026-08-01') // earlier than "from": from comes back instead
  await expect(page.getByTestId('period-text')).toHaveText('01/08/2026 – 01/08/2026')
})

test('reports - expenses by main category: biggest first, then drill down to each expense', async ({ page }) => {
  await seed(page)
  await page.goto('/reports?tab=expenses&range=thisMonth')
  const drill = page.getByRole('table', { name: 'Expenses by main category' })

  // collapsed, it is the main categories only, biggest first, with their share of all expenses
  await expect(drill.getByRole('row')).toHaveCount(1 + 2 + 1) // header, two main categories, total
  await expect(drill.getByRole('row').nth(1)).toContainText('Premises')
  await expect(drill.getByRole('row').nth(1)).toContainText('AED 500.00')
  await expect(drill.getByRole('row').nth(1)).toContainText('55.6%')
  await expect(drill.getByRole('row').nth(2)).toContainText('Food & beverage')
  await expect(drill.getByRole('row').nth(2)).toContainText('AED 400.00')
  await expect(drill.getByRole('row').nth(2)).toContainText('44.4%')
  await expect(drill.locator('tfoot')).toContainText('AED 900.00')
  await expect(drill.getByRole('row', { name: /Meat & seafood/ })).toHaveCount(0)

  // level two: its sub-categories
  const food = drill.getByRole('button', { name: 'Food & beverage' })
  await expect(food).toHaveAttribute('aria-expanded', 'false')
  await food.click()
  await expect(food).toHaveAttribute('aria-expanded', 'true')
  await expect(drill.getByRole('row', { name: /Meat & seafood/ })).toContainText('AED 300.00')
  await expect(drill.getByRole('row', { name: /Meat & seafood/ })).toContainText('33.3%')
  await expect(drill.getByRole('row', { name: /Vegetables & fruit/ })).toContainText('AED 100.00')
  await expect(drill.getByRole('row', { name: /Live Sea food/ })).toHaveCount(0) // not yet

  // level three: the expenses behind a sub-category
  await drill.getByRole('button', { name: 'Meat & seafood' }).click()
  const line = drill.getByRole('row', { name: /Live Sea food/ })
  await expect(line).toContainText('01/10/2026')
  await expect(line).toContainText('Cash drawer')
  await expect(line).toContainText('AED 300.00')
  await expect(line.getByRole('link', { name: '01/10/2026' })).toHaveAttribute('href', '/daily?date=2026-10-01&step=expenses')
  await page.screenshot({ path: 'e2e/shots/report-drill.png', fullPage: true })

  // collapsing a branch hides everything under it
  await food.click()
  await expect(drill.getByRole('row', { name: /Meat & seafood/ })).toHaveCount(0)
  await expect(drill.getByRole('row', { name: /Live Sea food/ })).toHaveCount(0)

  await page.getByRole('region', { name: 'Expenses by main category' }).getByRole('button', { name: 'Expand all' }).click()
  await expect(drill.getByRole('row', { name: /Live Sea food/ })).toBeVisible()
  await expect(drill.getByRole('row', { name: /Landlord/ })).toContainText('AED 500.00')
  await expect(drill.getByRole('row', { name: /Al Wafa/ })).toContainText('AED 100.00')
  await page.getByRole('region', { name: 'Expenses by main category' }).getByRole('button', { name: 'Collapse all' }).click()
  await expect(drill.getByRole('row')).toHaveCount(4)
})

test('reports - expenses by main category: an expense without a category is its own group', async ({ page }) => {
  await seed(page)
  await page.goto('/reports?tab=expenses&range=lastYear')
  const drill = page.getByRole('table', { name: 'Expenses by main category' })
  await expect(drill.getByRole('row').nth(1)).toContainText('Uncategorised')
  await expect(drill.getByRole('row').nth(1)).toContainText('100.0%')
  await drill.getByRole('button', { name: 'Uncategorised' }).click()
  await expect(drill.getByRole('row', { name: /Al Wafa/ })).toContainText('AED 50.00')
  await expect(drill.locator('tfoot')).toContainText('AED 50.00')
})

test('reports - expenses: main categories over time, by month', async ({ page }) => {
  await seed(page)
  await page.goto('/reports?tab=expenses&range=thisYear')
  const matrix = page.getByRole('table', { name: 'Main categories over time' })
  await expect(matrix.getByRole('columnheader')).toHaveText(['Main category', /Sep(t)? 2026/, 'Oct 2026', 'Total'])
  const food = matrix.getByRole('row', { name: /^Food & beverage/ })
  await expect(food).toContainText('AED 400.00') // September: Al Wafa 400.00; October: 400.00 as well
  await expect(food.getByRole('cell')).toHaveText(['Food & beverage', 'AED 400.00', 'AED 400.00', 'AED 800.00'])
  await expect(matrix.getByRole('row', { name: /^Premises/ }).getByRole('cell')).toHaveText(['Premises', '—', 'AED 500.00', 'AED 500.00'])
  await expect(matrix.locator('tfoot').getByRole('cell')).toHaveText(['Total', 'AED 400.00', 'AED 900.00', 'AED 1,300.00'])

  // by day instead
  await page.getByRole('radio', { name: 'Day', exact: true }).click()
  await expect(matrix.getByRole('columnheader')).toHaveCount(1 + 3 + 1) // three days with expenses
  await page.getByRole('radio', { name: 'Year', exact: true }).click()
  await expect(matrix.locator('tfoot').getByRole('cell')).toHaveText(['Total', 'AED 1,300.00', 'AED 1,300.00'])
})

test('reports - expenses by main category: CSV has one row per expense with both category levels', async ({ page }) => {
  await seed(page)
  await page.goto('/reports?tab=expenses&range=thisMonth')
  const card = page.getByRole('region', { name: 'Expenses by main category' })
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Export CSV' }).click()])
  expect(download.suggestedFilename()).toBe('daybook-expenses-by-category-2026-10-01_2026-10-26.csv')
  const lines = (await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8')).replace(/^\uFEFF/, '').split('\r\n')
  expect(lines[0]).toBe('Main category,Sub-category,Date,Supplier / market,Paid from,Receipt no.,Note,Amount')
  expect(lines).toContain('Premises,Rent,2026-10-01,Landlord,Bank account,,,500.00')
  expect(lines).toContain('Food & beverage,Meat & seafood,2026-10-01,Live Sea food,Cash drawer,,,300.00')
  expect(lines).toContain('Food & beverage,Vegetables & fruit,2026-10-02,Al Wafa,Cash drawer,,,100.00')
  expect(lines).toHaveLength(4) // header + three expenses
})

test('dashboard: a card bar is split into Visa and Mastercard, and stays one bar', async ({ page }) => {
  await seed(page)
  await page.evaluate(async () => {
    const { query } = await import('/src/db/client.ts')
    const d = await import('/src/db/repo/daily.ts')
    const mc = Number((await query("SELECT id FROM income_channel WHERE name_en = 'Mastercard'"))[0].id)
    await d.saveSale('2026-10-03', mc, 30000)
  })
  await page.goto('/dashboard?range=thisMonth&open=1')
  const channels = page.getByRole('region', { name: 'Sales by channel' })
  const card = channels.getByRole('listitem').filter({ hasText: /^Card/ })
  await expect(card.getByTestId('bar-segment')).toHaveCount(2)
  await expect(card).toContainText('AED 800.00') // Visa 500 + Mastercard 300
  await expect(card).toContainText('Visa AED 500.00')
  await expect(card).toContainText('Mastercard AED 300.00')
  // Cash and delivery apps are their own bars, not under Dine in / Delivery
  await expect(channels.getByRole('listitem').filter({ hasText: /^Keeta/ })).toHaveCount(1)
  // the two sections have their own headings and totals: Dine in 3,999 + 300 + ... , Delivery 500
  await expect(channels.getByRole('heading', { name: 'Dine in' })).toBeVisible()
  await expect(channels.getByRole('heading', { name: 'Delivery' })).toBeVisible()
  await expect(channels.getByRole('presentation').filter({ hasText: 'Delivery' })).toContainText('AED 500.00')
  await expect(channels.getByRole('presentation').filter({ hasText: 'Dine in' })).toContainText('AED 4,799.00')
  await page.screenshot({ path: 'e2e/shots/split-sales.png', fullPage: true })
})

test('print: the whole report goes to the printer, a contents page first, then the open tab comes back', async ({ page }) => {
  await page.goto('/reports?tab=expenses&range=custom&from=2026-10-01&to=2026-10-31')
  await expect(page.getByRole('tabpanel', { name: 'Expenses' })).toBeVisible()
  // Stand in for the print dialog: note what would have been printed
  await page.evaluate(() => {
    window.print = () => {
      const w = window as unknown as { printed: string[]; contents: string[] }
      w.printed = [...document.querySelectorAll('main section > h2.text-2xl')].map((h) => h.textContent ?? '')
      w.contents = [...document.querySelectorAll('[data-testid="report-cover"] li')].map((li) => li.textContent ?? '')
    }
  })
  await page.getByRole('button', { name: 'Print / save as PDF' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed?: string[] }).printed)).toEqual(['1. Summary', '2. Sales', '3. Expenses', '4. Daily log'])
  expect(await page.evaluate(() => (window as unknown as { contents: string[] }).contents)).toEqual(['1. Summary', '2. Sales', '3. Expenses', '4. Daily log'])
  await expect(page.getByRole('tabpanel', { name: 'Expenses' })).toBeVisible()
})
