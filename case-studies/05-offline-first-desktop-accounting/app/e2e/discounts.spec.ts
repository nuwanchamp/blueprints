import { expect, test, type Page } from '@playwright/test'

const DAY = '2026-10-26'
const nav = (page: Page) => page.getByRole('navigation').filter({ has: page.getByRole('button', { name: /^1/ }) })
const goStep = (page: Page, name: string) => nav(page).getByRole('button', { name: new RegExp(name) }).click()
const summary = (page: Page) => page.getByRole('complementary', { name: 'Cash drawer today' })

async function fillMoney(page: Page, label: string, value: string) {
  const f = page.getByLabel(label, { exact: true })
  await f.fill(value)
  await f.blur()
}

async function openSales(page: Page) {
  await page.goto(`/daily?date=${DAY}&step=sales`)
  await expect(page.getByRole('heading', { name: 'Daily close' })).toBeVisible()
}

test('a discount is a memo: sales stay as received and expected cash does not move', async ({ page }) => {
  await openSales(page)
  await fillMoney(page, 'Opening float', '500')
  await fillMoney(page, 'Amount: Cash', '900') // a 1,000.00 bill, 100.00 discount, 900.00 received
  await expect(summary(page)).toContainText(/Expected in drawer\s*AED 1,400\.00/)

  await page.getByRole('radio', { name: 'Member discount' }).click()
  await fillMoney(page, 'Amount', '100')
  await page.getByLabel('Note (optional)').fill('Gold member')
  await page.getByRole('button', { name: 'Add discount' }).click()

  await expect(page.getByTestId('total-discounts')).toHaveText('AED 100.00')
  await expect(page.getByTestId('total-sales')).toHaveText('AED 900.00') // as received
  await expect(page.getByTestId('gross-sales')).toHaveText('AED 1,000.00') // before the discount
  await expect(page.getByText('Gold member')).toBeVisible()
  await expect(summary(page)).toContainText(/Expected in drawer\s*AED 1,400\.00/) // unchanged by the discount
  await page.screenshot({ path: 'e2e/shots/discounts.png', fullPage: true })

  // it survives a reload, and the review shows it by reason next to the gross figure
  await page.reload()
  await expect(page.getByTestId('total-discounts')).toHaveText('AED 100.00')
  await goStep(page, 'Review')
  await expect(page.getByRole('heading', { name: 'Discounts by reason' })).toBeVisible()
  const sales = page.locator('section.border-t').filter({ has: page.getByRole('heading', { name: 'Sales by channel' }) })
  await expect(sales).toContainText('Sales before discounts')
  await expect(sales).toContainText('AED 1,000.00')

  // counting what is really in the drawer balances without any allowance for the discount
  await fillMoney(page, 'Counted cash', '1400')
  await expect(page.locator('[data-status="balanced"]')).toBeVisible()
})

test('recording a discount on the wrong figure would not fix a cash difference', async ({ page }) => {
  // The case the memo design protects against: entering the full price as sales makes the drawer look short.
  await openSales(page)
  await fillMoney(page, 'Opening float', '500')
  await fillMoney(page, 'Amount: Cash', '1000') // wrong: the customer only paid 900
  await page.getByRole('radio', { name: 'Promotion' }).click()
  await fillMoney(page, 'Amount', '100')
  await page.getByRole('button', { name: 'Add discount' }).click()
  await goStep(page, 'Review')
  await fillMoney(page, 'Counted cash', '1400') // what is physically there
  await expect(page.locator('[data-status="within"], [data-status="alert"]')).toContainText('AED 100.00 short')
})

test('the discount form names what is missing, and discounts can be deleted', async ({ page }) => {
  await openSales(page)
  await page.getByRole('button', { name: 'Add discount' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a reason' })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Enter an amount above zero' })).toBeVisible()

  await page.getByRole('radio', { name: 'Staff discount' }).click()
  await fillMoney(page, 'Amount', '25.50')
  await page.getByLabel('Amount', { exact: true }).press('Enter')
  await expect(page.getByTestId('total-discounts')).toHaveText('AED 25.50')

  await page.getByRole('button', { name: 'Delete: Staff discount' }).click()
  await page.getByRole('button', { name: /Yes, delete: Staff discount/ }).click()
  await expect(page.getByTestId('total-discounts')).toHaveText('AED 0.00')
  await expect(page.getByText('No discounts today.')).toBeVisible()
})

test('a closed day cannot take new discounts', async ({ page }) => {
  await openSales(page)
  await fillMoney(page, 'Amount: Cash', '100')
  await page.getByRole('radio', { name: 'Promotion' }).click()
  await fillMoney(page, 'Amount', '10')
  await page.getByRole('button', { name: 'Add discount' }).click()
  await goStep(page, 'Review')
  await fillMoney(page, 'Counted cash', '100')
  await page.getByRole('button', { name: 'Close day' }).click()
  await expect(page.getByText('This day is closed').first()).toBeVisible()
  await goStep(page, 'Sales')
  await expect(page.getByRole('button', { name: 'Add discount' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Delete: Promotion/ })).toHaveCount(0)
  await expect(page.getByTestId('total-discounts')).toHaveText('AED 10.00') // still shown
})

test('discount reasons are managed in Settings and show up on the sales step', async ({ page }) => {
  await page.goto('/settings/discount-reasons')
  await expect(page.getByRole('heading', { name: 'Discount reasons' })).toBeVisible()
  await expect(page.getByText('4 active · 0 inactive')).toBeVisible()
  await page.getByRole('button', { name: '+ Add reason' }).click()
  const p = page.getByRole('dialog', { name: 'Add discount reason' })
  await p.getByLabel('English name').fill('Happy hour')
  await p.getByLabel('Chinese name').fill('欢乐时光')
  await p.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('5 active · 0 inactive')).toBeVisible()
  await page.getByRole('switch', { name: /^Promotion:/ }).click() // switched off: no longer offered

  await openSales(page)
  await expect(page.getByRole('radio', { name: 'Happy hour' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Promotion' })).toHaveCount(0)
})

test('Chinese UI', async ({ page }) => {
  await openSales(page)
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('heading', { name: '折扣' })).toBeVisible()
  await page.getByRole('radio', { name: '会员折扣' }).click()
  await page.getByLabel('金额', { exact: true }).fill('100')
  await page.getByLabel('金额', { exact: true }).blur()
  await page.getByRole('button', { name: '添加折扣' }).click()
  await expect(page.getByTestId('total-discounts')).toHaveText('AED 100.00')
})
