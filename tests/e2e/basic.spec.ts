import { test, expect } from '@playwright/test'

test('loads studio and shows stages', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('AI-Powered Basketball Hype Lab')).toBeVisible()
  await expect(page.getByText('Upload Footage')).toBeVisible()
  await expect(page.getByText('AI Analysis')).toBeVisible()
})

