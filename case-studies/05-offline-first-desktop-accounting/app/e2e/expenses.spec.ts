import { expect, test, type Page } from '@playwright/test'

const summary = (page: Page, active: number, inactive: number) =>
  expect(page.getByText(`${active} active · ${inactive} inactive`)).toBeVisible()

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Expense categories' })).toBeVisible()
})

test('opens on expense categories with the seeded two-level list', async ({ page }) => {
  await expect(page).toHaveURL(/\/settings\/expense-categories$/)
  await summary(page, 18, 0)
  await expect(page.getByRole('row', { name: /Food & beverage/ }).first()).toBeVisible()
  await expect(page.getByRole('row', { name: /Meat & seafood/ })).toContainText('Food & beverage')
  await expect(page.getByRole('row', { name: /Meat & seafood/ })).toContainText('Variable')
  await page.screenshot({ path: 'e2e/shots/categories-desktop.png' })
})

test('switching a parent off switches its sub-categories off too', async ({ page }) => {
  await page.getByRole('switch', { name: /^Staff:/ }).click()
  await summary(page, 14, 4)
  await expect(page.getByRole('switch', { name: /^Salaries:/ })).not.toBeChecked()
  // a sub-category cannot be switched back on while its parent is off
  await page.getByRole('switch', { name: /^Salaries:/ }).click()
  await expect(page.getByRole('status')).toContainText('Switch the parent category on first')
})

test('adds a category, rejects a duplicate, and keeps data after reload', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add category' }).click()
  const panel = page.getByRole('dialog', { name: 'Add category' })
  await panel.getByLabel('English name').fill('Insurance')
  await panel.getByLabel('Chinese name').fill('保险')
  await panel.getByRole('radio', { name: 'Premises' }).click()
  // sub-category without a type is rejected
  await panel.getByRole('button', { name: 'Save' }).click()
  await expect(panel.getByText('Choose an expense type')).toBeVisible()
  await panel.getByRole('radio', { name: 'Fixed' }).click()
  await panel.getByRole('button', { name: 'Save' }).click()
  await expect(panel).toBeHidden()
  await summary(page, 19, 0)
  await expect(page.getByRole('row', { name: /Insurance/ })).toContainText('保险')

  // same name under the same parent is a duplicate
  await page.getByRole('button', { name: '+ Add category' }).click()
  await panel.getByLabel('English name').fill('insurance')
  await panel.getByLabel('Chinese name').fill('保险')
  await panel.getByRole('radio', { name: 'Premises' }).click()
  await panel.getByRole('radio', { name: 'Fixed' }).click()
  await panel.getByRole('button', { name: 'Save' }).click()
  await expect(panel.getByText('This name already exists here')).toBeVisible()
  await panel.getByRole('button', { name: 'Cancel' }).click()

  await page.reload()
  await expect(page.getByRole('row', { name: /Insurance/ })).toBeVisible()
  await summary(page, 19, 0)
})

test('edits a category and filters by search in either language', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit: Rent' }).click()
  const panel = page.getByRole('dialog', { name: 'Edit category' })
  await panel.getByLabel('Chinese name').fill('房租')
  await panel.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('row', { name: /Rent/ })).toContainText('房租')

  await page.getByRole('searchbox').fill('房租')
  await expect(page.getByRole('row', { name: /Rent/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /Salaries/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /^Premises/ })).toBeVisible() // parent stays for context
})

test('expense types: add, switch off, and category counts', async ({ page }) => {
  await page.getByRole('link', { name: /Expense types/ }).first().click()
  await expect(page.getByRole('row', { name: /Variable/ })).toContainText('10')
  await page.getByRole('button', { name: '+ Add type' }).click()
  const panel = page.getByRole('dialog', { name: 'Add expense type' })
  await panel.getByLabel('English name').fill('Seasonal')
  await panel.getByLabel('Chinese name').fill('季节性')
  await panel.getByRole('button', { name: 'Save' }).click()
  await summary(page, 4, 0)
  await page.getByRole('switch', { name: /^Seasonal:/ }).click()
  await summary(page, 3, 1)
})

test('language switch changes every label but keeps both record names', async ({ page }) => {
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('heading', { name: '支出类别' })).toBeVisible()
  await expect(page.getByText('18 个启用 · 0 个停用')).toBeVisible()
  await expect(page.getByRole('row', { name: /Meat & seafood/ })).toContainText('肉类海鲜')
  await expect(page.getByRole('row', { name: /Meat & seafood/ })).toContainText('食材饮品') // parent shown in Chinese
  await page.screenshot({ path: 'e2e/shots/categories-zh.png' })
})

test('tablet width: edit panel becomes a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1100 })
  await expect(page.getByRole('link', { name: /Expense types/ }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Edit: Rent' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit category' })).toBeVisible()
  await page.screenshot({ path: 'e2e/shots/categories-tablet.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})
