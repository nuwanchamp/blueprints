import { expect, test, type Page } from '@playwright/test'

const nav = (page: Page) => page.getByRole('navigation').filter({ has: page.getByRole('button', { name: /^1/ }) })
const goStep = (page: Page, name: string) => nav(page).getByRole('button', { name: new RegExp(name) }).click()

async function fillMoney(page: Page, label: string, value: string) {
  const f = page.getByLabel(label, { exact: true })
  await f.fill(value)
  await f.blur()
}

async function open(page: Page, date: string, step = 'sales') {
  await page.goto(`/daily?date=${date}&step=${step}`)
  await expect(page.getByRole('heading', { name: 'Daily close' })).toBeVisible()
}

/** A day with one of everything: sales, discount, expense, cash movement, count and note. */
async function fillWholeDay(page: Page, date: string) {
  await open(page, date)
  await fillMoney(page, 'Opening float', '500')
  await fillMoney(page, 'Amount: Cash', '1000')
  await page.getByRole('radio', { name: 'Promotion' }).click()
  await fillMoney(page, 'Amount', '50')
  await page.getByRole('button', { name: 'Add discount' }).click()
  await expect(page.getByTestId('total-discounts')).toHaveText('AED 50.00')

  await goStep(page, 'Expenses')
  await page.getByLabel('Supplier / market', { exact: true }).fill('Al Wafa')
  await fillMoney(page, 'Amount', '85')
  await page.getByLabel('Amount', { exact: true }).press('Enter')
  await expect(page.getByLabel('Amount: Al Wafa')).toBeVisible()

  await goStep(page, 'Cash drawer')
  await page.getByRole('radio', { name: /Bank deposit/ }).click()
  await fillMoney(page, 'Amount', '300')
  await page.getByRole('button', { name: 'Add movement' }).click()
  await expect(page.getByText('No cash movements today.')).toHaveCount(0)
  await fillMoney(page, 'Counted cash', '1115') // 500 + 1,000 - 85 - 300

  await goStep(page, 'Review')
  await page.getByLabel(/Explain anything unusual/).fill('Typed under the wrong date')
  await page.getByLabel(/Explain anything unusual/).blur()
}

async function expectWholeDay(page: Page) {
  await goStep(page, 'Sales')
  await expect(page.getByLabel('Opening float', { exact: true })).toHaveValue('500.00')
  await expect(page.getByTestId('total-sales')).toHaveText('AED 1,000.00')
  await expect(page.getByTestId('total-discounts')).toHaveText('AED 50.00')
  await goStep(page, 'Expenses')
  await expect(page.getByTestId('total-expenses')).toHaveText('AED 85.00')
  await goStep(page, 'Cash drawer')
  await expect(page.getByLabel('Counted cash', { exact: true })).toHaveValue('1,115.00')
  await expect(page.getByText('Bank deposit').first()).toBeVisible()
  await goStep(page, 'Review')
  await expect(page.getByLabel(/Explain anything unusual/)).toHaveValue('Typed under the wrong date')
  await expect(page.locator('[data-status="balanced"]')).toBeVisible()
}

test('a day typed under the wrong date moves, with everything in it', async ({ page }) => {
  await fillWholeDay(page, '2026-10-26')
  await page.getByRole('button', { name: 'Change date' }).click()
  const card = page.getByRole('region', { name: 'Move this day to another date' })
  await expect(card).toContainText('The new date must have nothing entered yet')
  await card.getByLabel('New date').fill('2026-10-25')
  await page.screenshot({ path: 'e2e/shots/move-day.png' })
  await card.getByRole('button', { name: 'Move day' }).click()

  await expect(page).toHaveURL(/date=2026-10-25/)
  await expect(card).toHaveCount(0)
  await expectWholeDay(page)

  // nothing is left behind on the old date
  await open(page, '2026-10-26')
  await expect(page.getByTestId('total-sales')).toHaveText('AED 0.00')
  await expect(page.getByRole('button', { name: 'Change date' })).toHaveCount(0) // nothing stored there any more
})

test('a date that already has entries is refused, and nothing moves', async ({ page }) => {
  await open(page, '2026-10-25')
  await fillMoney(page, 'Amount: Cash', '10')
  await expect(page.getByTestId('total-sales')).toHaveText('AED 10.00') // saved, before leaving the page
  await open(page, '2026-10-26')
  await fillMoney(page, 'Amount: Cash', '1000')
  await page.getByRole('button', { name: 'Change date' }).click()
  const card = page.getByRole('region', { name: 'Move this day to another date' })
  await card.getByLabel('New date').fill('2026-10-25')
  await card.getByRole('button', { name: 'Move day' }).click()
  await expect(card.getByRole('alert')).toContainText('That date already has entries')
  await expect(page).toHaveURL(/date=2026-10-26/)
  await expect(page.getByTestId('total-sales')).toHaveText('AED 1,000.00')
  await open(page, '2026-10-25')
  await expect(page.getByTestId('total-sales')).toHaveText('AED 10.00') // untouched
})

test('the new date must be a real, different, past or present date', async ({ page }) => {
  await open(page, '2026-10-26')
  await fillMoney(page, 'Amount: Cash', '1000')
  await page.getByRole('button', { name: 'Change date' }).click()
  const card = page.getByRole('region', { name: 'Move this day to another date' })
  await card.getByLabel('New date').fill('2026-10-26')
  await card.getByRole('button', { name: 'Move day' }).click()
  await expect(card.getByRole('alert')).toContainText('Choose a different date')
  await card.getByLabel('New date').fill('2099-01-01')
  await card.getByRole('button', { name: 'Move day' }).click()
  await expect(card.getByRole('alert')).toContainText('cannot be in the future')
  await card.getByRole('button', { name: 'Cancel' }).click()
  await expect(card).toHaveCount(0)
})

test('a closed day must be reopened before it can move, and stays open afterwards', async ({ page }) => {
  await open(page, '2026-10-26')
  await fillMoney(page, 'Amount: Cash', '1000')
  await goStep(page, 'Review')
  await fillMoney(page, 'Counted cash', '1000')
  await page.getByRole('button', { name: 'Close day' }).click()
  await expect(page.getByText('This day is closed').first()).toBeVisible()

  await page.getByRole('button', { name: 'Change date' }).click()
  const card = page.getByRole('region', { name: 'Move this day to another date' })
  await expect(card).toContainText('Reopen it on the review step before moving it')
  await expect(card.getByRole('button', { name: 'Move day' })).toBeDisabled()
  await card.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'Reopen day' }).click()
  await page.getByRole('button', { name: 'Change date' }).click()
  await card.getByLabel('New date').fill('2026-10-24')
  await card.getByRole('button', { name: 'Move day' }).click()
  await expect(page).toHaveURL(/date=2026-10-24/)
  await expect(page.getByText('This day is closed')).toHaveCount(0) // moved as an open day, to be closed again
  await goStep(page, 'Sales')
  await expect(page.getByTestId('total-sales')).toHaveText('AED 1,000.00')
})

test('a date that only has an untouched opening float can be moved onto', async ({ page }) => {
  await open(page, '2026-10-25')
  await fillMoney(page, 'Opening float', '777') // creates a row, but no entries
  await expect(page.getByRole('complementary', { name: 'Cash drawer today' }).getByText('AED 777.00').first()).toBeVisible() // saved
  await page.reload()
  await expect(page.getByLabel('Opening float', { exact: true })).toHaveValue('777.00') // saved, before leaving the page
  await open(page, '2026-10-26')
  await fillMoney(page, 'Opening float', '500')
  await fillMoney(page, 'Amount: Cash', '1000')
  await page.getByRole('button', { name: 'Change date' }).click()
  const card = page.getByRole('region', { name: 'Move this day to another date' })
  await card.getByLabel('New date').fill('2026-10-25')
  await card.getByRole('button', { name: 'Move day' }).click()
  await expect(page).toHaveURL(/date=2026-10-25/)
  await expect(page.getByLabel('Opening float', { exact: true })).toHaveValue('500.00') // the moved day's own float wins
  await expect(page.getByTestId('total-sales')).toHaveText('AED 1,000.00')
})

test('Chinese UI', async ({ page }) => {
  await open(page, '2026-10-26')
  await fillMoney(page, 'Amount: Cash', '1000')
  await page.getByRole('button', { name: '中文' }).click()
  await page.getByRole('button', { name: '更改日期' }).click()
  const card = page.getByRole('region', { name: '将当天移到另一个日期' })
  await card.getByLabel('新日期').fill('2026-10-25')
  await card.getByRole('button', { name: '移动' }).click()
  await expect(page).toHaveURL(/date=2026-10-25/)
  await expect(page.getByTestId('total-sales')).toHaveText('AED 1,000.00')
})
