import { expect, test, type Page } from '@playwright/test'

const DAY = '2026-10-26'

async function open(page: Page, date = DAY) {
  await page.goto(`/daily?date=${date}&step=expenses`)
  await expect(page.getByRole('heading', { name: 'Daily close' })).toBeVisible()
}

const supplier = (page: Page) => page.getByRole('combobox', { name: 'Supplier / market', exact: true })
const amount = (page: Page) => page.getByLabel('Amount', { exact: true })
const suggestions = (page: Page) => page.getByRole('listbox', { name: 'Supplier / market — suggestions' })

/** A full expense the first time a market is used: the category and account are chosen by hand. */
async function addFirstTime(page: Page, name: string, fils: string, category: string, paidFrom: string) {
  await supplier(page).fill(name)
  await page.getByLabel('Category', { exact: true }).selectOption({ label: category })
  await page.getByLabel('Paid from', { exact: true }).selectOption({ label: paidFrom })
  await amount(page).fill(fils)
  await amount(page).press('Enter')
  await expect(amount(page)).toHaveValue('')
}

test('markets used before are offered, narrow as you type, and bring their category and account', async ({ page }) => {
  await open(page)
  await addFirstTime(page, 'Al Wafa', '166', 'Vegetables & fruit', 'Petty cash')
  await addFirstTime(page, 'Live Sea food', '237.50', 'Meat & seafood', 'Cash drawer')

  await supplier(page).click() // opens on focus with every known market
  await expect(suggestions(page).getByRole('option')).toHaveCount(2)
  await supplier(page).fill('al')
  await expect(suggestions(page).getByRole('option')).toHaveCount(1)
  const option = suggestions(page).getByRole('option', { name: /Al Wafa/ })
  await expect(option).toContainText('Vegetables & fruit') // shows what it was last used for
  await expect(option).toContainText('Petty cash')
  await page.screenshot({ path: 'e2e/shots/supplier-search.png' })

  await option.click()
  await expect(supplier(page)).toHaveValue('Al Wafa')
  await expect(suggestions(page)).toHaveCount(0)
  await expect(page.getByLabel('Category', { exact: true }).locator('option:checked')).toHaveText('Vegetables & fruit')
  await expect(page.getByLabel('Paid from', { exact: true }).locator('option:checked')).toHaveText('Petty cash')
  await expect(page.getByTestId('filled-from')).toContainText('Al Wafa')

  await amount(page).fill('90')
  await amount(page).press('Enter')
  await expect(amount(page)).toHaveValue('')
  // the second Al Wafa carries the same category and account
  await expect(page.getByLabel(/^Category: Al Wafa/).nth(1).locator('option:checked')).toHaveText('Vegetables & fruit')
  await expect(page.getByTestId('total-expenses')).toHaveText('AED 493.50')
})

test('keyboard: arrows and Enter pick, Enter alone adds, Escape closes', async ({ page }) => {
  await open(page)
  await addFirstTime(page, 'Al Wafa', '10', 'Beverages', 'Cash drawer')
  await addFirstTime(page, 'Al Barsha Market', '20', 'Cleaning', 'Cash drawer')

  await supplier(page).fill('al')
  await expect(suggestions(page).getByRole('option')).toHaveCount(2)
  await supplier(page).press('Escape')
  await expect(suggestions(page)).toHaveCount(0)
  await supplier(page).press('ArrowDown')
  await expect(suggestions(page)).toBeVisible()
  await supplier(page).press('ArrowDown') // first, then second
  await supplier(page).press('Enter')
  await expect(supplier(page)).toHaveValue(/Al (Wafa|Barsha Market)/)
  await expect(page.getByTestId('filled-from')).toBeVisible()

  // with nothing highlighted, Enter adds the typed entry (same as before)
  await supplier(page).fill('Zero Gravity')
  await amount(page).fill('185')
  await supplier(page).press('Enter')
  await expect(amount(page)).toHaveValue('')
  await expect(page.getByLabel('Supplier / market: Zero Gravity')).toBeVisible()
})

test('a new name needs no extra step, and is offered next time; case does not create duplicates', async ({ page }) => {
  await open(page)
  await supplier(page).fill('Karama Market')
  await expect(suggestions(page)).toHaveCount(0) // nothing matches, nothing to choose
  await amount(page).fill('20')
  await amount(page).press('Enter')
  await supplier(page).fill('karama market')
  await amount(page).fill('30')
  await amount(page).press('Enter')

  await supplier(page).fill('kar')
  await expect(suggestions(page).getByRole('option')).toHaveCount(1) // one market, however it was typed
  await expect(suggestions(page).getByRole('option').first()).not.toContainText('·') // never categorised: no usual category or account
})

test('markets are remembered across days', async ({ page }) => {
  await open(page, '2026-10-24')
  await addFirstTime(page, 'Satwa Market', '60', 'Utilities', 'Bank account')
  await open(page, '2026-10-26')
  await supplier(page).fill('satwa')
  await suggestions(page).getByRole('option').first().click()
  await expect(page.getByLabel('Category', { exact: true }).locator('option:checked')).toHaveText('Utilities')
  await expect(page.getByLabel('Paid from', { exact: true }).locator('option:checked')).toHaveText('Bank account')
})

test('a saved row: picking a market names it, and gives an uncategorised expense its usual category', async ({ page }) => {
  await open(page)
  await addFirstTime(page, 'Al Wafa', '166', 'Vegetables & fruit', 'Cash drawer')
  // an expense typed without a category, whose market is not known yet
  await supplier(page).fill('Mystery')
  await amount(page).fill('50')
  await amount(page).press('Enter')
  await expect(page.getByLabel('Category: Mystery').locator('option:checked')).toHaveText('Uncategorised')

  // she realises it was Al Wafa: search it in the saved row
  const cell = page.getByRole('combobox', { name: 'Supplier / market: Mystery' })
  await cell.fill('al wa')
  await page.getByRole('listbox', { name: 'Supplier / market: Mystery — suggestions' }).getByRole('option').first().click()
  await expect(page.getByLabel('Supplier / market: Al Wafa').first()).toHaveValue('Al Wafa')
  // category came with it, and was not overwritten by a second save when the field lost focus
  await expect(page.getByLabel(/^Category: Al Wafa/).nth(1).locator('option:checked')).toHaveText('Vegetables & fruit')
  await page.getByLabel('Amount: Al Wafa').nth(1).click() // moves focus away
  await expect(page.getByLabel(/^Category: Al Wafa/).nth(1).locator('option:checked')).toHaveText('Vegetables & fruit')
  await expect(page.getByText('1 expense still needs a category')).toHaveCount(0)
})

test('closed day: the market cell is read-only', async ({ page }) => {
  await open(page)
  await addFirstTime(page, 'Al Wafa', '100', 'Beverages', 'Cash drawer')
  await page.getByRole('navigation').filter({ has: page.getByRole('button', { name: /^1/ }) }).getByRole('button', { name: /Review/ }).click()
  await page.getByLabel('Counted cash', { exact: true }).fill('0')
  await page.getByLabel('Counted cash', { exact: true }).blur()
  await page.getByLabel(/Explain anything unusual/).fill('Counted for the test')
  await page.getByLabel(/Explain anything unusual/).blur()
  await page.getByRole('button', { name: 'Close day' }).click()
  await expect(page.getByText('This day is closed').first()).toBeVisible()
  await page.getByRole('navigation').filter({ has: page.getByRole('button', { name: /^1/ }) }).getByRole('button', { name: /Expenses/ }).click()
  await expect(page.getByRole('combobox', { name: 'Supplier / market: Al Wafa' })).toBeDisabled()
})

test('Chinese UI', async ({ page }) => {
  await open(page)
  await addFirstTime(page, 'Al Wafa', '166', 'Vegetables & fruit', 'Petty cash')
  await page.getByRole('button', { name: '中文' }).click()
  const zhSupplier = page.getByRole('combobox', { name: '供应商 / 市场', exact: true })
  await zhSupplier.fill('al')
  const option = page.getByRole('listbox', { name: '供应商 / 市场 — 建议' }).getByRole('option').first()
  await expect(option).toContainText('食材饮品 › 蔬果')
  await expect(option).toContainText('备用金')
})

test('the suggestion list scrolls into view when it would open below the screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 })
  await open(page)
  await addFirstTime(page, 'Al Wafa', '166', 'Vegetables & fruit', 'Petty cash')
  await addFirstTime(page, 'Live Sea food', '237.50', 'Meat & seafood', 'Cash drawer')
  await supplier(page).click()
  const list = suggestions(page)
  await expect(list).toBeVisible()
  await expect(async () => {
    const box = await list.boundingBox()
    const h = await page.evaluate(() => window.innerHeight)
    expect(box!.y + box!.height).toBeLessThanOrEqual(h + 1)
  }).toPass()
})
