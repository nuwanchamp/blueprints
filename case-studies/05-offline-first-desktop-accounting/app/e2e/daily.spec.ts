import { expect, test, type Page } from '@playwright/test'

const DAY = '2026-10-26'

async function openDay(page: Page, step = 'sales', date = DAY) {
  await page.goto(`/daily?date=${date}&step=${step}`)
  await expect(page.getByRole('heading', { name: 'Daily close' })).toBeVisible()
}
// The step list is the navigation that holds the step buttons; its label changes with the language
const goStep = (page: Page, name: string) => page.getByRole('navigation').filter({ has: page.getByRole('button', { name: /^1/ }) }).getByRole('button', { name: new RegExp(name) }).click()
const summary = (page: Page) => page.getByRole('complementary', { name: 'Cash drawer today' })

async function fillMoney(page: Page, label: string, value: string) {
  const f = page.getByLabel(label, { exact: true })
  await f.fill(value)
  await f.blur()
}

/** Adds an expense in the table's top row: fill the cells, press Enter in the amount. */
async function addExpense(page: Page, amount: string, category: string | null, paidFrom?: string, supplier?: string) {
  const amt = page.getByLabel('Amount', { exact: true })
  if (category) await page.getByLabel('Category', { exact: true }).selectOption({ label: category })
  if (paidFrom) await page.getByLabel('Paid from', { exact: true }).selectOption({ label: paidFrom })
  if (supplier) await page.getByLabel('Supplier / market', { exact: true }).fill(supplier)
  await amt.fill(amount)
  await amt.press('Enter')
  await expect(amt).toHaveValue('') // the row was added and the entry row is clear again
}

test('sales: amounts add up, split into cash and other, and survive a reload', async ({ page }) => {
  await openDay(page)
  await fillMoney(page, 'Amount: Cash', '3420')
  await fillMoney(page, 'Amount: Visa', '5,000.50')
  await fillMoney(page, 'Amount: Talabat', '2500')
  await expect(page.getByTestId('total-sales')).toHaveText('AED 10,920.50')
  await expect(page.getByLabel('Amount: Cash', { exact: true })).toHaveValue('3,420.00') // reformatted
  await expect(summary(page)).toContainText('AED 7,500.50') // card + platform
  // groups carry subtotals, and sales are entered only on the channels at the bottom (Visa, not Card)
  await expect(page.getByTestId('group-Dine in')).toContainText('AED 8,420.50')
  await expect(page.getByTestId('group-Card')).toContainText('AED 5,000.50')
  await expect(page.getByTestId('group-Delivery')).toContainText('AED 2,500.00')
  await expect(page.getByLabel('Amount: Card', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Amount: Mastercard')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('total-sales')).toHaveText('AED 10,920.50')
  await page.screenshot({ path: 'e2e/shots/daily-sales.png' })
})

test('a mistyped amount is rejected and not saved', async ({ page }) => {
  await openDay(page)
  const cash = page.getByLabel('Amount: Cash', { exact: true })
  await cash.fill('12.345')
  await cash.blur()
  await expect(page.getByRole('alert')).toContainText('Enter an amount above zero')
  await expect(page.getByTestId('total-sales')).toHaveText('AED 0.00')
})

test('expenses: add in the table, edit cells in place, delete; only drawer payments change expected cash', async ({ page }) => {
  await openDay(page, 'expenses')
  await addExpense(page, '85', 'Meat & seafood', 'Cash drawer', 'Butcher')
  await addExpense(page, '120.00', 'Cleaning', 'Petty cash', 'Cleaning Co')
  await expect(page.getByTestId('total-expenses')).toHaveText('AED 205.00')
  await expect(page.getByLabel('Category: Butcher').locator('option:checked')).toHaveText('Meat & seafood')
  await expect(page.getByLabel('Paid from: Cleaning Co').locator('option:checked')).toHaveText('Petty cash')
  await expect(summary(page).getByText('− AED 85.00')).toBeVisible() // petty cash did not touch the drawer
  expect(await page.getByRole('dialog').count()).toBe(0) // no popup anywhere

  // edit cells directly in the row
  await fillMoney(page, 'Amount: Butcher', '90.50')
  await expect(page.getByTestId('total-expenses')).toHaveText('AED 210.50')
  await page.getByLabel('Paid from: Cleaning Co').selectOption({ label: 'Cash drawer' })
  await expect(summary(page).getByText('− AED 210.50')).toBeVisible() // now both come out of the drawer
  await page.getByLabel('Receipt no.: Butcher').fill('R-77')
  await page.getByLabel('Receipt no.: Butcher').blur()
  // The database handles requests in order, so once the next day has loaded the save has finished
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page).toHaveURL(/date=2026-10-27/)
  await expect(page.getByTestId('total-expenses')).toHaveText('AED 0.00')
  await page.getByRole('button', { name: 'Previous day' }).click()
  await page.reload()
  await expect(page.getByLabel('Receipt no.: Butcher')).toHaveValue('R-77')

  await page.getByRole('button', { name: 'Delete: Cleaning Co' }).click()
  await page.getByRole('button', { name: /Yes, delete: Cleaning Co/ }).click()
  await expect(page.getByTestId('total-expenses')).toHaveText('AED 90.50')
  await page.screenshot({ path: 'e2e/shots/daily-expenses.png' })
})

test('entry row: needs an amount, warns about the drawer, and lists only choosable categories', async ({ page }) => {
  await openDay(page, 'expenses')
  await page.getByRole('button', { name: '+ Add expense' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter an amount above zero')
  const category = page.getByLabel('Category', { exact: true })
  await category.selectOption({ label: 'Rent' })
  await page.getByLabel('Amount', { exact: true }).fill('4500')
  await page.getByLabel('Amount', { exact: true }).blur()
  await expect(page.getByText('AED 4,500.00 will be deducted')).toBeVisible()
  await page.getByLabel('Paid from', { exact: true }).selectOption({ label: 'Bank account' })
  await expect(page.getByText('does not change')).toBeVisible()
  // parents with sub-categories are group headings, not choices
  await expect(category.locator('option').filter({ hasText: /^Staff$/ })).toHaveCount(0)
  await expect(category.locator('option').filter({ hasText: /^Licences & government fees$/ })).toHaveCount(1)
  await expect(category.locator('optgroup')).toHaveCount(4)
})

test('cash: movements, count, and the variance wording', async ({ page }) => {
  await openDay(page)
  await fillMoney(page, 'Opening float', '500')
  await fillMoney(page, 'Amount: Cash', '3420')
  await goStep(page, 'Expenses')
  await addExpense(page, '85', 'Meat & seafood', 'Cash drawer')
  await goStep(page, 'Cash drawer')

  // Float top-up is selected by default, so only the missing amount is named, next to its field
  await expect(page.getByRole('radio', { name: /Float top-up/ })).toBeChecked()
  await page.getByRole('button', { name: 'Add movement' }).click()
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(page.getByRole('alert')).toHaveText('Enter an amount above zero')
  await fillMoney(page, 'Amount', '5555.65')
  await page.getByLabel('Note').fill('From Boss')
  await page.getByRole('radio', { name: /Owner withdrawal/ }).click()
  await expect(page.getByRole('alert')).toHaveCount(0) // picking a reason clears its message
  await page.getByLabel('Note').fill('')
  await fillMoney(page, 'Amount', '0')
  await page.getByLabel('Amount', { exact: true }).fill('')
  await page.getByLabel('Amount', { exact: true }).blur()

  // owner withdrawal needs a note
  await page.getByRole('radio', { name: /Owner withdrawal/ }).click()
  await fillMoney(page, 'Amount', '2000')
  await page.getByRole('button', { name: 'Add movement' }).click()
  await expect(page.getByRole('alert')).toContainText('A note is required')
  await page.getByLabel('Note').fill('Owner took cash')
  await page.getByRole('button', { name: 'Add movement' }).click()
  await expect(page.getByText('Owner took cash')).toBeVisible()

  // the list adds up: totals added, taken out, and the net
  await expect(page.getByTestId('total-cash-added')).toHaveText('AED 0.00')
  await expect(page.getByTestId('total-cash-out')).toHaveText('AED 2,000.00')
  await expect(page.getByTestId('net-cash-movements')).toHaveText('− AED 2,000.00')
  await page.getByRole('radio', { name: /Float top-up/ }).click()
  await fillMoney(page, 'Amount', '2500.50')
  await page.getByRole('button', { name: 'Add movement' }).click()
  await expect(page.getByTestId('total-cash-added')).toHaveText('AED 2,500.50')
  await expect(page.getByTestId('net-cash-movements')).toHaveText('+ AED 500.50')
  await page.getByRole('button', { name: 'Delete: Float top-up' }).click()
  await page.getByRole('button', { name: /Yes, delete/ }).click()
  await expect(page.getByTestId('total-cash-added')).toHaveText('AED 0.00')

  // 500 + 3,420 - 85 - 2,000 = 1,835.00
  await expect(summary(page).getByText('AED 1,835.00')).toBeVisible()
  await expect(summary(page).getByText('Available before deductions')).toBeVisible()
  // the working lives in the side summary: the total before deductions, then the deductions
  await expect(summary(page)).toContainText(/Available before deductions\s*AED 3,920\.00/) // 500 + 3,420
  await expect(summary(page)).toContainText(/Cash expenses\s*− AED 85\.00/)
  await expect(summary(page)).toContainText(/Cash taken out\s*− AED 2,000\.00/)
  // next to the count there is just the one figure to count against, not a second copy of the working
  await expect(page.getByLabel('How the expected cash is made up')).toHaveCount(0)
  await expect(page.getByTestId('expected-cash')).toHaveText('AED 1,835.00')
  await expect(page.locator('[data-status="uncounted"]')).toBeVisible()
  await fillMoney(page, 'Counted cash', '1835')
  await expect(page.locator('[data-status="balanced"]')).toContainText('balances')
  await fillMoney(page, 'Counted cash', '1825')
  await expect(page.locator('[data-status="within"]')).toContainText('AED 10.00 short')
  await fillMoney(page, 'Counted cash', '1700')
  await expect(page.locator('[data-status="alert"]')).toContainText('AED 135.00 short')
  await page.screenshot({ path: 'e2e/shots/daily-cash.png' })
})

test('close and reopen a day', async ({ page }) => {
  await openDay(page)
  await fillMoney(page, 'Opening float', '500')
  await fillMoney(page, 'Amount: Cash', '1000')
  await goStep(page, 'Review')
  await expect(page.getByRole('button', { name: 'Close day' })).toBeDisabled() // not counted
  await expect(page.getByText('The drawer has not been counted')).toBeVisible()

  await goStep(page, 'Cash drawer')
  await fillMoney(page, 'Counted cash', '1400') // expected 1,500 -> 100 short, over the AED 20 limit
  await goStep(page, 'Review')
  await expect(page.getByRole('button', { name: 'Close day' })).toBeDisabled() // needs an explanation
  await page.getByLabel(/Explain anything unusual/).fill('Short after a refund')
  await expect(page.getByRole('button', { name: 'Close day' })).toBeEnabled()
  await page.getByRole('button', { name: 'Close day' }).click()

  await expect(page.getByText('This day is closed').first()).toBeVisible()
  await goStep(page, 'Sales')
  await expect(page.getByLabel('Amount: Cash', { exact: true })).toBeDisabled()
  await goStep(page, 'Expenses')
  await expect(page.getByLabel('Amount', { exact: true })).toHaveCount(0) // no entry row on a closed day

  await page.reload() // still closed after a reload
  await expect(page.getByText('This day is closed').first()).toBeVisible()
  await goStep(page, 'Review')
  await page.getByRole('button', { name: 'Reopen day' }).click()
  await expect(page.getByRole('button', { name: 'Close day' })).toBeVisible()
})

test("the next day opens with the previous day's counted cash", async ({ page }) => {
  await openDay(page)
  await fillMoney(page, 'Amount: Cash', '1000')
  await goStep(page, 'Cash drawer')
  await fillMoney(page, 'Counted cash', '1000')
  await goStep(page, 'Review')
  await page.getByRole('button', { name: 'Close day' }).click()
  await expect(page.getByText('This day is closed').first()).toBeVisible()

  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page).toHaveURL(/date=2026-10-27/)
  await goStep(page, 'Sales')
  await expect(page.getByLabel('Opening float', { exact: true })).toHaveValue('1,000.00')
  await expect(page.getByText('This day is closed')).toHaveCount(0)
})

test('Chinese UI: labels switch, names show in Chinese, and the data is the same', async ({ page }) => {
  await openDay(page, 'expenses')
  await addExpense(page, '85', 'Meat & seafood', 'Cash drawer')
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('heading', { name: '每日结账' })).toBeVisible()
  await expect(page.getByLabel(/^类别:/).locator('option:checked')).toHaveText('肉类海鲜')
  await expect(page.getByTestId('total-expenses')).toHaveText('AED 85.00')
  await goStep(page, '销售')
  await expect(page.getByLabel('开店零钱', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'e2e/shots/daily-zh.png' })
})

test('tablet width: stepper becomes a row and the summary moves below', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1200 })
  await openDay(page)
  await fillMoney(page, 'Amount: Cash', '1000')
  await expect(page.getByRole('navigation', { name: 'Daily close' })).toBeVisible()
  await page.screenshot({ path: 'e2e/shots/daily-tablet.png', fullPage: true })
})

test('review step: count the drawer right there, see the difference, and close', async ({ page }) => {
  await openDay(page)
  await fillMoney(page, 'Opening float', '500')
  await fillMoney(page, 'Amount: Cash', '1000')
  await goStep(page, 'Review')

  // not counted: closing is blocked, and the field to fix that is on this same step
  await expect(page.getByText('The drawer has not been counted')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close day' })).toBeDisabled()
  await expect(page.locator('[data-status="uncounted"]')).toBeVisible()

  await fillMoney(page, 'Counted cash', '1500') // expected 500 + 1,000
  await expect(page.locator('[data-status="balanced"]')).toContainText('balances')
  await expect(page.getByText('The drawer has not been counted')).toHaveCount(0)
  await expect(page.getByText('Ready to close.')).toBeVisible()
  await page.getByRole('button', { name: 'Close day' }).click()

  await expect(page.getByText('This day is closed').first()).toBeVisible()
  await expect(page.getByLabel('Counted cash')).toHaveCount(0) // read-only once closed
  await expect(page.getByText('AED 1,500.00').first()).toBeVisible()
})

test('the count sits in its own tinted panel on the cash step', async ({ page }) => {
  await openDay(page, 'cash')
  const panel = page.getByTestId('count-panel')
  await expect(panel).toContainText('Counted cash')
  await expect(panel).toContainText('Expected in drawer')
  await expect(panel.locator('[data-status]')).toBeVisible()
  // tinted, so it reads as a separate area from the white card around it
  expect(await panel.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgb(255, 255, 255)')
  expect(await panel.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  await page.screenshot({ path: 'e2e/shots/count-panel.png' })
})

test('a mistyped amount shows a red message and a red field border', async ({ page }) => {
  await openDay(page)
  const f = page.getByLabel('Amount: Cash', { exact: true })
  await f.fill('12abc')
  await f.blur()
  const msg = page.getByRole('alert').filter({ hasText: 'Enter an amount above zero' })
  await expect(msg).toBeVisible()
  await expect(msg).toHaveCSS('color', 'rgb(179, 38, 30)')
  await expect(f.locator('xpath=..')).toHaveCSS('border-top-color', 'rgb(179, 38, 30)')
  await page.screenshot({ path: 'e2e/shots/field-error.png' })
})

test('expenses table: the cog hides columns such as Receipt no., and the choice is remembered', async ({ page }) => {
  await openDay(page, 'expenses')
  await expect(page.getByRole('textbox', { name: 'Receipt no.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Table columns' }).click()
  const menu = page.getByRole('group', { name: 'Table columns' })
  await expect(menu.getByRole('checkbox')).toHaveCount(3) // Category, Paid from, Receipt no.; market and amount always stay
  await menu.getByRole('checkbox', { name: 'Receipt no.' }).uncheck()
  await expect(page.getByRole('textbox', { name: 'Receipt no.', exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toBeVisible() // the others stay

  // a hidden column still adds an expense, and the choice survives a reload
  await page.getByLabel('Supplier / market', { exact: true }).fill('Al Wafa')
  const amt = page.getByLabel('Amount', { exact: true })
  await amt.fill('50')
  await amt.press('Enter')
  await expect(page.getByTestId('total-expenses')).toHaveText('AED 50.00')
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Receipt no.', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Table columns' }).click()
  await expect(page.getByRole('checkbox', { name: 'Receipt no.' })).not.toBeChecked()
  await page.screenshot({ path: 'e2e/shots/columns.png' })
  await page.getByRole('checkbox', { name: 'Receipt no.' }).check()
  await expect(page.getByRole('textbox', { name: 'Receipt no.', exact: true })).toBeVisible()
})
