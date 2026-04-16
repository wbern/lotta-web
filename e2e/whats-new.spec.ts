import { waitForApi } from './api-helpers'
import { expect, test } from './fixtures'

test.describe('Vad är nytt dialog', () => {
  test('opens from Hjälp menu and renders changelog entries', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Hjälp' }).click()
    await page.waitForTimeout(400)
    await page.getByTestId('menu-dropdown').getByText('Vad är nytt').click()
    await page.waitForTimeout(500)

    await expect(page.getByTestId('dialog-title').filter({ hasText: 'Vad är nytt' })).toBeVisible()
    await expect(page.getByTestId('changelog-group').first()).toBeVisible()

    await page.waitForTimeout(1500)
  })

  test('checks for updates via Hjälp menu and shows status', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Hjälp' }).click()
    await page.waitForTimeout(400)
    await page.getByTestId('menu-dropdown').getByText('Sök efter uppdateringar').click()
    await page.waitForTimeout(500)

    await expect(
      page.getByTestId('dialog-title').filter({ hasText: 'Sök efter uppdateringar' }),
    ).toBeVisible()
    await expect(page.getByTestId('update-check-status')).toBeVisible()

    await page.waitForTimeout(1500)
  })
})
