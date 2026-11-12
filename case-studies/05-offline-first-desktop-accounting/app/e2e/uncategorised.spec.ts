import { expect, test, type Page } from '@playwright/test'

const DAY = '2026-10-26'
const nav = (page: Page) => page.getByRole('navigation').filter({ has: page.getByRole('button', { name: /^1/ }) })
const goStep = (page: Page, name: string) => nav(page).getByRole('button', { name: new RegExp(name) }).click()

/** The solid badge on an uncategorised row (not the same word inside the dropdown). */
const badge = (page: Page, text = 'Uncategorised') => page.locator('span').filter({ hasText: new RegExp(`^${text}$`) })

async function openDay(page: Page, step = 'expenses', date = DAY) {
  await page.goto(`/daily?date=${date}&step=${step}`)
  await expect(page.getByRole('heading', { name: 'Daily close' })).toBeVisible()
}

/** What happens at the counter: only the market's name and the amount are known. */
async function addMarketExpense(page: Page, supplier: string, amount: string) {
  await page.getByLabel('Supplier / market', { exact: true }).fill(supplier)
  const amt = page.getByLabel('Amount', { exact: true })
  await amt.fill(amount)
  await amt.press('Enter')
  await expect(amt).toHaveValue('')
}

test('an expense with only a market name saves as uncategorised and still counts', async ({ page }) => {
  await openDay(page)
  await addMarketExpense(page, 'Al Barsha Market', '150')
  await expect(page.getByLabel('Supplier / market: Al Barsha Market')).toHaveValue('Al Barsha Market')
  await expect(badge(page)).toBeVisible()
  await expect(page.getByText('1 expense still needs a category')).toBeVisible()
  await expect(page.getByTestId('total-expenses')).toHaveText('AED 150.00')
  // paid from the drawer by default, so it reduces the expected cash even without a category
  await expect(page.getByRole('complementary', { name: 'Cash drawer today' }).getByText('− AED 150.00')).toBeVisible()
  await page.screenshot({ path: 'e2e/shots/uncategorised-list.png' })
})

test('categorise from the list and the banner goes away', async ({ page }) => {
  await openDay(page)
  await addMarketExpense(page, 'Al Barsha Market', '150')
  await page.getByLabel('Category: Al Barsha Market').selectOption({ label: 'Vegetables & fruit' })
  await expect(page.getByLabel('Category: Al Barsha Market').locator('option:checked')).toHaveText('Vegetables & fruit')
  await expect(badge(page)).toHaveCount(0)
  await expect(page.getByText(/still needs? a category|still need a category/)).toHaveCount(0)
  await expect(page.getByTestId('total-expenses')).toHaveText('AED 150.00')
})

test('the review step warns but does not block, and shows the uncategorised total', async ({ page }) => {
  await openDay(page, 'sales')
  await page.getByLabel('Amount: Cash', { exact: true }).fill('1000')
  await page.getByLabel('Amount: Cash', { exact: true }).blur()
  await goStep(page, 'Expenses')
  await addMarketExpense(page, 'Al Barsha Market', '150')
  await goStep(page, 'Cash drawer')
  await page.getByLabel('Counted cash').fill('850')
  await page.getByLabel('Counted cash').blur()
  await goStep(page, 'Review')

  await expect(page.getByText('1 expense has no category yet')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Needs a category' })).toBeVisible()
  const byCategory = page.locator('section.border-t').filter({ has: page.getByRole('heading', { name: 'Expenses by category' }) })
  await expect(byCategory).toContainText('Uncategorised')
  await expect(page.getByRole('button', { name: 'Close day' })).toBeEnabled() // warning only
  await page.getByRole('button', { name: 'Close day' }).click()
  await expect(page.getByText('This day is closed').first()).toBeVisible()

  // The day is locked, but its uncategorised expense can still be sorted out
  await page.getByLabel('Categorise: Al Barsha Market').selectOption({ label: 'Meat & seafood' })
  await expect(page.getByRole('heading', { name: 'Needs a category' })).toHaveCount(0)
  await expect(byCategory).toContainText('Food & beverage')
  await goStep(page, 'Expenses')
  await expect(page.getByLabel('Amount: Al Barsha Market')).toBeDisabled() // amounts stay locked
  await expect(page.getByTestId('total-expenses')).toHaveText('AED 150.00')
})

test('the fix-later list finds uncategorised expenses on other days', async ({ page }) => {
  await openDay(page, 'expenses', '2026-10-24')
  await addMarketExpense(page, 'Satwa Market', '60.50')
  await openDay(page, 'expenses', '2026-10-26')
  await expect(page.getByText('1 expense still needs a category')).toBeVisible() // seen from another day
  await page.getByRole('button', { name: 'Show' }).click()
  const panel = page.getByRole('dialog', { name: 'Expenses that need a category' })
  await expect(panel).toContainText('24/10/2026')
  await expect(panel).toContainText('Satwa Market')
  await panel.getByLabel('Categorise: Satwa Market').selectOption({ label: 'Cleaning' })
  await expect(panel.getByText('Everything is categorised.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'category' })).toHaveCount(0)

  // and "Open day" jumps to the right day
  await openDay(page, 'expenses', '2026-10-25')
  await addMarketExpense(page, 'Karama Market', '20')
  await openDay(page, 'sales', '2026-10-26')
  await page.getByRole('button', { name: 'Show' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Open day' }).click()
  await expect(page).toHaveURL(/date=2026-10-25&step=expenses|step=expenses&date=2026-10-25/)
  await expect(page.getByLabel('Supplier / market: Karama Market')).toBeVisible()
})

test('Chinese UI for the same flow', async ({ page }) => {
  await openDay(page)
  await addMarketExpense(page, 'Al Barsha Market', '150')
  await page.getByRole('button', { name: '中文' }).click()
  await expect(badge(page, '未分类')).toBeVisible()
  await expect(page.getByText('还有 1 笔支出需要选择类别')).toBeVisible()
  await page.getByLabel('类别: Al Barsha Market').selectOption({ label: '蔬果' })
  await expect(page.getByLabel('类别: Al Barsha Market').locator('option:checked')).toHaveText('蔬果')
})

test('a Miscellaneous category created in Settings can be used, then changed before the day is closed', async ({ page }) => {
  // The restaurant adds it itself, as a top-level category with no sub-categories
  await page.goto('/settings/expense-categories')
  await page.getByRole('button', { name: '+ Add category' }).click()
  const panel = page.getByRole('dialog', { name: 'Add category' })
  await panel.getByLabel('English name').fill('Miscellaneous')
  await panel.getByLabel('Chinese name').fill('杂项')
  await panel.getByRole('button', { name: 'Save' }).click()
  await expect(panel).toBeHidden()

  // It is now a choice in the expenses table, listed on its own like Licences
  await openDay(page)
  await addMarketExpense(page, 'Al Wafa', '166')
  const category = page.getByLabel('Category: Al Wafa')
  await expect(category.locator('option').filter({ hasText: /^Miscellaneous$/ })).toHaveCount(1)
  await category.selectOption({ label: 'Miscellaneous' })
  await expect(category.locator('option:checked')).toHaveText('Miscellaneous')
  await expect(page.getByText(/still needs? a category|still need a category/)).toHaveCount(0) // it is a real category, not "to sort"

  // When closing the day she can still change her mind once she knows what it was
  await page.getByLabel('Category: Al Wafa').selectOption({ label: 'Vegetables & fruit' })
  await expect(page.getByLabel('Category: Al Wafa').locator('option:checked')).toHaveText('Vegetables & fruit')
  await goStep(page, 'Review')
  await expect(page.locator('section.border-t').filter({ has: page.getByRole('heading', { name: 'Expenses by category' }) })).toContainText('Food & beverage')
})
