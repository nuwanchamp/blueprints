import { expect, test } from '@playwright/test'

test('income channels: the Dine in / Delivery tree is seeded, with Visa and Mastercard under Card', async ({ page }) => {
  await page.goto('/settings/income-channels')
  await expect(page.getByRole('heading', { name: 'Income channels' })).toBeVisible()
  await expect(page.getByText('14 active · 0 inactive')).toBeVisible()
  const names = await page.getByRole('row').evaluateAll((rows) => rows.slice(1).map((r) => (r.querySelector('[role=cell]') as HTMLElement).innerText.replace(/\s+/g, ' ').trim()))
  expect(names).toEqual(['Dine in', 'Card', 'Visa', 'Mastercard', 'Cash Core', 'Member pay', 'Alipay', 'WeChat', 'Careem Dineout', 'Bank transfer', 'Delivery', 'Keeta', 'Talabat', 'Deliveroo'])
  await expect(page.getByRole('row', { name: /^Visa/ })).toContainText('Dine in › Card')
  await expect(page.getByRole('row', { name: /^Cash/ })).toContainText('Yes') // cash goes into the drawer
  await expect(page.getByRole('row', { name: /^Visa/ })).toContainText('No')
  await expect(page.getByRole('row', { name: /^Card/ })).toContainText('—') // a channel with sub-channels has no setting of its own
  await expect(page.getByRole('switch', { name: /^Cash:/ })).toBeDisabled()
  await expect(page.getByRole('link', { name: /Channel types/ })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/shots/settings-channels.png' })
})

test('income channels: add under a group, reject duplicates, and keep within three levels', async ({ page }) => {
  await page.goto('/settings/income-channels')
  await page.getByRole('button', { name: '+ Add channel' }).click()
  const p = page.getByRole('dialog', { name: 'Add channel' })
  await p.getByLabel('English name').fill('Noon Food')
  await p.getByLabel('Chinese name').fill('Noon Food')
  await p.getByRole('radio', { name: 'Delivery', exact: true }).click()
  await p.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('15 active · 0 inactive')).toBeVisible()
  await expect(page.getByRole('row', { name: /^Noon Food/ })).toContainText('Delivery')

  // the same name under the same parent is a duplicate; under another parent it is fine
  await page.getByRole('button', { name: '+ Add channel' }).click()
  await p.getByLabel('English name').fill('noon food')
  await p.getByLabel('Chinese name').fill('x')
  await p.getByRole('radio', { name: 'Delivery', exact: true }).click()
  await p.getByRole('button', { name: 'Save' }).click()
  await expect(p.getByText('This name already exists here')).toBeVisible()

  // Visa is already three levels down (Dine in > Card > Visa): nothing can go under it
  await expect(p.getByRole('radio', { name: 'Dine in › Card › Visa' })).toBeDisabled()
  await expect(p.getByRole('radio', { name: 'Dine in › Card', exact: true })).toBeEnabled()
  await p.getByRole('button', { name: 'Cancel' }).click()

  // a channel cannot move under itself or its own sub-channels
  await page.getByRole('button', { name: 'Edit: Card' }).click()
  const e = page.getByRole('dialog', { name: 'Edit channel' })
  await expect(e.getByRole('radio', { name: 'Dine in › Card', exact: true })).toBeDisabled()
  await expect(e.getByRole('radio', { name: 'Dine in › Card › Visa' })).toBeDisabled()
  await expect(e.getByText('has sub-channels')).toBeVisible()
})

test('income channels: switching a group off switches off everything under it, but never the core channel', async ({ page }) => {
  await page.goto('/settings/income-channels')
  await page.getByRole('switch', { name: /^Delivery:/ }).click()
  await expect(page.getByText('10 active · 4 inactive')).toBeVisible() // Delivery + Keeta, Talabat, Deliveroo
  await expect(page.getByRole('switch', { name: /^Talabat:/ })).not.toBeChecked()
  // a child cannot be switched on under an inactive group
  await page.getByRole('switch', { name: /^Talabat:/ }).click()
  await expect(page.getByRole('status')).toContainText('Switch the parent category on first')
  // Dine in holds the core Cash channel, so it stays on
  await page.getByRole('switch', { name: /^Dine in:/ }).click()
  await expect(page.getByRole('status')).toContainText('Core records cannot be switched off')
  await expect(page.getByRole('switch', { name: /^Cash:/ })).toBeChecked()
})

test('income channels: search keeps the way down to a match', async ({ page }) => {
  await page.goto('/settings/income-channels')
  await page.getByRole('searchbox').fill('visa')
  await expect(page.getByRole('row', { name: /^Dine in/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /^Card/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /^Visa/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /^Alipay/ })).toHaveCount(0)
})

test('paid-from accounts: kind decides whether the drawer is affected', async ({ page }) => {
  await page.goto('/settings/paid-from-accounts')
  await expect(page.getByRole('row', { name: /Cash drawer/ })).toContainText('Yes')
  await expect(page.getByRole('row', { name: /Petty cash/ })).toContainText('No')
  await expect(page.getByRole('switch', { name: /^Cash drawer:/ })).toBeDisabled()
})

test('cash movement reasons: direction and note rule are shown', async ({ page }) => {
  await page.goto('/settings/cash-movement-reasons')
  await expect(page.getByRole('row', { name: /Bank deposit/ })).toContainText('Cash taken out')
  await expect(page.getByRole('row', { name: /Owner withdrawal/ })).toContainText('Yes')
  await page.screenshot({ path: 'e2e/shots/settings-reasons.png' })
})

test('closed days are protected: a channel with sales on a closed day cannot change its drawer setting', async ({ page }) => {
  await page.goto('/daily?date=2026-10-26')
  await page.getByLabel('Amount: Visa', { exact: true }).fill('100')
  await page.getByLabel('Amount: Visa', { exact: true }).blur()
  await page.getByRole('navigation').filter({ has: page.getByRole('button', { name: /^1/ }) }).getByRole('button', { name: /Cash drawer/ }).click()
  await page.getByLabel('Counted cash').fill('0')
  await page.getByLabel('Counted cash').blur()
  await page.getByRole('navigation').filter({ has: page.getByRole('button', { name: /^1/ }) }).getByRole('button', { name: /Review/ }).click()
  await page.getByRole('button', { name: 'Close day' }).click()
  await expect(page.getByText('This day is closed').first()).toBeVisible()

  await page.goto('/settings/income-channels')
  await page.getByRole('button', { name: 'Edit: Visa' }).click()
  const p = page.getByRole('dialog', { name: 'Edit channel' })
  await p.getByRole('radio', { name: 'Yes' }).click()
  await p.getByRole('button', { name: 'Save' }).click()
  await expect(p.getByText('This would change days that are already closed')).toBeVisible()
})

test('channels can be reordered, and Daily close lists them in that order', async ({ page }) => {
  await page.goto('/settings/income-channels')
  const table = page.getByRole('table', { name: 'Income channels' })
  await expect(table).toBeVisible()
  // the first channel under Dine in cannot go further up; Cash starts below Card
  await expect(page.getByRole('button', { name: 'Move up: Card', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Move up: Cash', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Move up: Cash', exact: true })).toBeDisabled() // now first
  const names = () => page.getByRole('row').evaluateAll((rows) => rows.map((r) => r.querySelector('[role=cell]:nth-child(1)')?.textContent ?? ''))
  await expect.poll(async () => (await names()).map((n) => n.replace('Core', '')).filter((n) => ['Dine in', 'Cash', 'Card'].includes(n)).slice(0, 3)).toEqual(['Dine in', 'Cash', 'Card'])

  await page.goto('/daily?date=2026-10-26&step=sales')
  const labels = page.getByLabel(/^Amount: /)
  await expect(labels.first()).toHaveAttribute('aria-label', 'Amount: Cash')

  // moving it back down also works, and the order survives a reload
  await page.goto('/settings/income-channels')
  await page.getByRole('button', { name: 'Move down: Cash', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Move up: Card', exact: true })).toBeDisabled() // Card is first again
  await expect(page.getByRole('button', { name: 'Move up: Cash', exact: true })).toBeEnabled()
})
