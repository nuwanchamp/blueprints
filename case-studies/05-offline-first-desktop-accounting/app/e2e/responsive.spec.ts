import { expect, test } from '@playwright/test'

// Small POS screens: 1024×768, 1366×768 at 125% scaling (1093×614), and the window's 800×560 minimum
const SIZES = [
  [1024, 768],
  [1093, 614],
  [800, 560],
]
const PAGES = ['/dashboard', '/daily?step=sales', '/daily?step=expenses', '/daily?step=cash', '/daily?step=review', '/reports', '/settings', '/settings/backup']

test('small screens: no page scrolls sideways', async ({ page }) => {
  test.setTimeout(120_000)
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height })
    for (const url of PAGES) {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForTimeout(200)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${url} at ${width}×${height}`).toBeLessThanOrEqual(1)
    }
  }
})

test('the sidebar is a strip of icons below 1280px and keeps its names', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/dashboard')
  const sidebar = page.getByRole('complementary').first()
  expect((await sidebar.boundingBox())!.width).toBeLessThan(80)
  await expect(page.getByText('Works offline. Data stays on this computer.')).toBeHidden()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Reports' }).click()
  await expect(page).toHaveURL(/\/reports/)
  await page.setViewportSize({ width: 1440, height: 960 })
  expect((await sidebar.boundingBox())!.width).toBeGreaterThan(200)
  await expect(page.getByText('Works offline. Data stays on this computer.')).toBeVisible()
})
