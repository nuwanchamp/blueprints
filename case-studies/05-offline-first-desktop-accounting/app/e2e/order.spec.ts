import { expect, test } from '@playwright/test'

test('expenses stay in the order they were entered, with the entry row last', async ({ page }) => {
  await page.goto('/daily?date=2026-10-26&step=expenses')
  const amt = page.getByLabel('Amount', { exact: true })
  for (const [name, fils] of [['Zero Gravity', '185'], ['Al Wafa', '166'], ['Live Sea food', '237.50']]) {
    await page.getByLabel('Supplier / market', { exact: true }).fill(name)
    await amt.fill(fils)
    await amt.press('Enter')
    await expect(amt).toHaveValue('')
  }
  const suppliers = () =>
    page.locator('[role=list] > ul > li').evaluateAll((lis) =>
      lis.map((li) => (li.querySelector('input[aria-label^="Supplier / market"]') as HTMLInputElement).value),
    )
  // first in, first listed; the empty entry row is the last row
  expect(await suppliers()).toEqual(['Zero Gravity', 'Al Wafa', 'Live Sea food', ''])

  // editing a row does not move it
  await page.getByLabel('Amount: Zero Gravity').fill('999')
  await page.getByLabel('Amount: Zero Gravity').blur()
  await page.getByLabel('Category: Al Wafa').selectOption({ label: 'Beverages' })
  expect(await suppliers()).toEqual(['Zero Gravity', 'Al Wafa', 'Live Sea food', ''])

  // the header button brings the entry row into view and reports a missing amount there
  await page.getByRole('button', { name: '+ Add expense' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter an amount above zero')
  await expect(page.getByLabel('Supplier / market', { exact: true })).toBeInViewport()
})
