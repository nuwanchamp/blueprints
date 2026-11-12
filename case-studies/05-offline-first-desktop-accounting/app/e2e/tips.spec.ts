import { expect, test, type Page } from '@playwright/test'

const DAY = '2026-10-26'

async function fillMoney(page: Page, label: string, value: string) {
  const f = page.getByLabel(label, { exact: true })
  await f.fill(value)
  await f.blur()
}
const goStep = (page: Page, name: string) => page.getByRole('navigation').filter({ has: page.getByRole('button', { name: /^1/ }) }).getByRole('button', { name: new RegExp(name) }).click()
const summary = (page: Page) => page.getByRole('complementary', { name: 'Cash drawer today' })

test('Visa and Mastercard: one field with the total and its tips; tips are taken off the sales and shown on their own', async ({ page }) => {
  await page.goto(`/daily?date=${DAY}&step=sales`)
  await expect(page.getByRole('heading', { name: 'Daily close' })).toBeVisible()
  await expect(page.getByLabel('tips: Visa', { exact: true })).toHaveAttribute('placeholder', '0.00')

  await fillMoney(page, 'Amount: Cash', '3000')
  // Type the machine's total, Tab, then the tips: two fields that look like one
  const visa = page.getByLabel('Amount: Visa', { exact: true })
  await visa.fill('5200')
  await visa.press('Tab')
  await expect(page.getByLabel('tips: Visa', { exact: true })).toBeFocused()
  await page.keyboard.type('200')
  await page.keyboard.press('Tab')
  await expect(visa).toHaveValue('5,200.00')
  await expect(page.getByLabel('tips: Visa', { exact: true })).toHaveValue('200.00')
  await expect(page.getByTestId('card-result-Visa')).toHaveText('Sales AED 5,000.00 · tips AED 200.00')
  // Leaving tips empty means no tips
  await fillMoney(page, 'Amount: Mastercard', '1000')
  await expect(page.getByTestId('card-result-Mastercard')).toHaveText('Sales AED 1,000.00 · no tips')
  await fillMoney(page, 'Amount: Mastercard', '1050')
  await fillMoney(page, 'tips: Mastercard', '50')
  await expect(page.getByTestId('card-result-Mastercard')).toHaveText('Sales AED 1,000.00 · tips AED 50.00')

  await expect(page.getByTestId('group-Card')).toContainText('AED 6,000.00')
  await expect(page.getByTestId('total-sales')).toHaveText('AED 9,000.00')
  await expect(page.getByTestId('card-tips')).toHaveText('AED 250.00')
  await expect(page.getByText('Received incl. tips')).toBeVisible()
  // Card money never goes into the drawer; tips are paid with salary
  await expect(summary(page)).toContainText('Card tips (for staff)')
  await expect(summary(page).getByText('AED 3,000.00').first()).toBeVisible()

  // Tips above the total are refused when leaving the field, and not saved
  await fillMoney(page, 'tips: Mastercard', '2000')
  await expect(page.getByRole('alert').filter({ hasText: 'Tips can’t be more than the total' })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Amount: Mastercard', { exact: true })).toHaveValue('1,050.00')
  await expect(page.getByLabel('tips: Mastercard', { exact: true })).toHaveValue('50.00')
  await expect(page.getByTestId('total-sales')).toHaveText('AED 9,000.00')
  await page.screenshot({ path: 'e2e/shots/daily-tips.png', fullPage: true })

  // The day closes, and the reports count sales after tips with the tips beside them
  await goStep(page, 'Cash drawer')
  await fillMoney(page, 'Counted cash', '3000')
  await goStep(page, 'Review')
  await page.getByRole('button', { name: 'Close day' }).click()
  await expect(page.getByText('This day is closed').first()).toBeVisible()
  await page.goto(`/reports?tab=summary&range=custom&from=${DAY}&to=${DAY}&by=day`)
  await expect(page.getByTestId('sum-sales')).toHaveText('AED 9,000.00')
  await expect(page.getByTestId('sum-tips')).toHaveText('AED 250.00')
})
