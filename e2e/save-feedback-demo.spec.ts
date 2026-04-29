import { seedHeroTournament } from './api-helpers'
import { expect, test } from './fixtures'
import { selectTournament } from './helpers'

// Demo spec for lt-dsn slice 1: in-place success feedback on the
// "Uppdatera uppgifter" button. Run with `pnpm test:e2e save-feedback-demo`
// — the recorded video doubles as a manual-QA artefact.
test.describe('Save-action feedback demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await seedHeroTournament(page)
    // Reload so the freshly-seeded tournament shows up in the selector dropdown.
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }).click()
    await page
      .locator('.menu-dropdown')
      .getByRole('button', { name: 'Turneringsspelare', exact: true })
      .click()
  })

  test('shows "✓ Sparat" on Uppdatera-uppgifter after a successful update', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const playerRow = dialog
      .getByTestId('data-table')
      .locator('tbody tr')
      .filter({ hasText: 'Järnsida' })
    await playerRow.dblclick()

    const firstName = dialog.locator('.form-group').filter({ hasText: 'Förnamn' }).locator('input')
    await expect(firstName).toHaveValue('Björn')
    await firstName.fill('Björne')

    const updateBtn = dialog.getByTestId('update-player')
    await expect(updateBtn).toBeEnabled()
    await updateBtn.click()

    // Transient confirmation: button disables and the "Sparat" label is shown.
    await expect(updateBtn).toBeDisabled()
    await expect(updateBtn.locator('span[aria-hidden="false"]')).toHaveText(/sparat/i)
  })

  test('shows error toast when update collides with the unique-name constraint', async ({
    page,
  }) => {
    // Björn Järnsida and Ubbe Ragnarsson are both in Uppsala SK; renaming
    // one onto the other trips UNIQUE (lastname, firstname, clubindex,
    // tournamentindex) and the mutation rejects.
    const dialog = page.getByTestId('dialog-overlay')
    const playerRow = dialog
      .getByTestId('data-table')
      .locator('tbody tr')
      .filter({ hasText: 'Järnsida' })
    await playerRow.dblclick()

    const firstName = dialog.locator('.form-group').filter({ hasText: 'Förnamn' }).locator('input')
    const lastName = dialog.locator('.form-group').filter({ hasText: 'Efternamn' }).locator('input')
    await firstName.fill('Ubbe')
    await lastName.fill('Ragnarsson')

    await dialog.getByTestId('update-player').click()

    const toast = page.getByTestId('toast')
    await expect(toast).toBeVisible()
    await expect(toast).toHaveText(/kunde inte spara/i)
  })

  test('storage warning + error toast share the bottom-left stack', async ({ page }) => {
    // The dialog is already open from the shared beforeEach. Close it,
    // override storage persistence to deny + reset the dismissal flag, then
    // reload so the storage warning fires on a fresh load.
    await page.getByRole('button', { name: 'Stäng' }).first().click()
    await page.evaluate(() => localStorage.removeItem('storage-warning-dismissed'))
    await page.addInitScript(() => {
      Object.defineProperty(navigator.storage, 'persist', {
        value: () => Promise.resolve(false),
        configurable: true,
      })
    })
    await page.reload()

    const toasts = page.getByTestId('toast')
    await expect(toasts).toHaveCount(1)
    await expect(toasts.first()).toContainText(/turneringsdata/i)
    await page.waitForTimeout(600)

    // Trigger an error toast on top via a UNIQUE-constraint rename.
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }).click()
    await page
      .locator('.menu-dropdown')
      .getByRole('button', { name: 'Turneringsspelare', exact: true })
      .click()

    const dialog = page.getByTestId('dialog-overlay')
    await dialog
      .getByTestId('data-table')
      .locator('tbody tr')
      .filter({ hasText: 'Järnsida' })
      .dblclick()
    await dialog.locator('.form-group').filter({ hasText: 'Förnamn' }).locator('input').fill('Ubbe')
    await dialog
      .locator('.form-group')
      .filter({ hasText: 'Efternamn' })
      .locator('input')
      .fill('Ragnarsson')
    await dialog.getByTestId('update-player').click()

    await expect(toasts).toHaveCount(2)
    await page.waitForTimeout(800)

    // Dismiss the storage warning via its OK action — error toast stays.
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(toasts).toHaveCount(1)
    await expect(toasts.first()).toContainText(/kunde inte spara/i)
    await page.waitForTimeout(800)
  })

  test('exploratory: repeated failing clicks stack and dismiss individually', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await dialog
      .getByTestId('data-table')
      .locator('tbody tr')
      .filter({ hasText: 'Järnsida' })
      .dblclick()

    await dialog.locator('.form-group').filter({ hasText: 'Förnamn' }).locator('input').fill('Ubbe')
    await dialog
      .locator('.form-group')
      .filter({ hasText: 'Efternamn' })
      .locator('input')
      .fill('Ragnarsson')

    const updateBtn = dialog.getByTestId('update-player')
    const toasts = page.getByTestId('toast')

    await updateBtn.click()
    await expect(toasts).toHaveCount(1)
    await page.waitForTimeout(700)
    await updateBtn.click()
    await expect(toasts).toHaveCount(2)
    await page.waitForTimeout(700)
    await updateBtn.click()
    await expect(toasts).toHaveCount(3)
    await page.waitForTimeout(700)

    // Dismiss the middle one — the others should remain.
    await toasts.nth(1).getByTestId('toast-dismiss').click()
    await expect(toasts).toHaveCount(2)
    await page.waitForTimeout(700)
  })
})
