/* eslint local/no-class-locators: "off" -- structural traversal (.context-menu, .context-submenu, .result-cell) */

import { apiClient, createTournament, pairRound, waitForApi } from './api-helpers'
import { expect, test } from './fixtures'

test.describe('Menu structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('all 6 menu buttons are visible', async ({ page }) => {
    const menuBar = page.getByTestId('menu-bar')
    await expect(menuBar.getByRole('button', { name: 'Turnering' })).toBeVisible()
    await expect(menuBar.getByRole('button', { name: 'Lotta' })).toBeVisible()
    await expect(menuBar.getByRole('button', { name: 'Ställning', exact: true })).toBeVisible()
    await expect(menuBar.getByRole('button', { name: 'Spelare', exact: true })).toBeVisible()
    await expect(menuBar.getByRole('button', { name: 'Inställningar' })).toBeVisible()
    await expect(menuBar.getByRole('button', { name: 'Hjälp' })).toBeVisible()
  })

  test('Turnering dropdown contains expected items', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    const dropdown = page.getByTestId('menu-dropdown')
    await expect(dropdown).toBeVisible()

    await expect(dropdown.getByText('Ny')).toBeVisible()
    await expect(dropdown.getByText('Editera')).toBeVisible()
    await expect(dropdown.getByText('Ta bort')).toBeVisible()
  })

  test('Lotta dropdown contains expected items', async ({ page }) => {
    // Select a tournament so all items are visible
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')
    await expect(page.getByTestId('data-table')).toBeVisible()

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' }).click()
    const dropdown = page.getByTestId('menu-dropdown')
    await expect(dropdown).toBeVisible()

    await expect(dropdown.getByText('Lotta nästa rond')).toBeVisible()
    await expect(dropdown.getByText('Skriv ut lottning')).toBeVisible()
    await expect(dropdown.getByText('Publicera lottning')).toBeVisible()
    await expect(dropdown.getByText('Skriv ut alfabetisk lottning')).toBeVisible()
    await expect(dropdown.getByText('Publicera alfabetisk lottning')).toBeVisible()
    await expect(dropdown.getByText('Ångra lottning')).toBeVisible()
    await expect(dropdown.getByText('Exportera till LiveChess')).toBeVisible()
    await expect(dropdown.getByText('Lägg till bord')).toBeVisible()
    await expect(dropdown.getByText('Editera bord')).toBeVisible()
    await expect(dropdown.getByText('Ta bort bord')).toBeVisible()
  })

  test('Ställning dropdown contains expected items', async ({ page }) => {
    await page
      .getByTestId('menu-bar')
      .getByRole('button', { name: 'Ställning', exact: true })
      .click()
    const dropdown = page.getByTestId('menu-dropdown')
    await expect(dropdown).toBeVisible()

    await expect(dropdown.getByText('Skriv ut ställning', { exact: true })).toBeVisible()
    await expect(dropdown.getByText('Publicera ställning', { exact: true })).toBeVisible()
    await expect(dropdown.getByText('Publicera korstabell')).toBeVisible()
    await expect(dropdown.getByText('Skriv ut klubbställning')).toBeVisible()
    await expect(dropdown.getByText('Publicera klubbställning')).toBeVisible()
  })

  test('Spelare dropdown contains expected items', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }).click()
    const dropdown = page.getByTestId('menu-dropdown')
    await expect(dropdown).toBeVisible()

    await expect(dropdown.getByText('Spelarpool', { exact: true })).toBeVisible()
    await expect(dropdown.getByText('Turneringsspelare', { exact: true })).toBeVisible()
    await expect(dropdown.getByText('Skriv ut spelarlista')).toBeVisible()
    await expect(dropdown.getByText('Publicera spelarlista')).toBeVisible()
    await expect(dropdown.getByText('Exportera turneringsspelare')).toBeVisible()
    await expect(dropdown.getByText('Importera till spelarpool')).toBeVisible()
  })

  test('Inställningar dropdown contains expected item', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    const dropdown = page.getByTestId('menu-dropdown')
    await expect(dropdown).toBeVisible()

    await expect(dropdown.getByText('Inställningar')).toBeVisible()
  })

  test('Hjälp dropdown contains expected items', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Hjälp' }).click()
    const dropdown = page.getByTestId('menu-dropdown')
    await expect(dropdown).toBeVisible()

    await expect(dropdown.getByText('Sök efter uppdateringar')).toBeVisible()
    await expect(dropdown.getByText('Om')).toBeVisible()
  })

  test('Editera and Ta bort are disabled without tournament selected', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    const dropdown = page.getByTestId('menu-dropdown')
    await expect(dropdown).toBeVisible()

    await expect(dropdown.getByText('Editera')).toBeDisabled()
    await expect(dropdown.getByText('Ta bort')).toBeDisabled()
    await expect(dropdown.getByText('Skapa FIDE-rapport')).toBeDisabled()
  })

  test('Editera and Ta bort are enabled with tournament selected', async ({ page }) => {
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')
    await expect(page.getByTestId('data-table')).toBeVisible()

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    const dropdown = page.getByTestId('menu-dropdown')
    await expect(dropdown).toBeVisible()

    await expect(dropdown.getByText('Editera')).toBeEnabled()
    await expect(dropdown.getByText('Ta bort')).toBeEnabled()
    await expect(dropdown.getByText('Skapa FIDE-rapport')).toBeDisabled()
  })

  test('menu closes on click outside', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    const dropdown = page.getByTestId('menu-dropdown')
    await expect(dropdown).toBeVisible()

    // Click outside the menu bar
    await page.getByTestId('tab-content').click({ force: true })
    await expect(dropdown).not.toBeVisible()
  })

  test('clicking one menu closes another', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await expect(page.getByTestId('menu-dropdown')).toBeVisible()
    await expect(page.getByTestId('menu-dropdown').getByText('Ny')).toBeVisible()

    // Click a different menu button
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Hjälp' }).click()
    const dropdown = page.getByTestId('menu-dropdown')
    await expect(dropdown).toBeVisible()

    // Should now show Hjälp items, not Turnering items
    await expect(dropdown.getByText('Om')).toBeVisible()
    await expect(dropdown.getByText('Ny')).not.toBeVisible()
  })

  test('clicking same menu button toggles dropdown closed', async ({ page }) => {
    const turneringBtn = page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' })

    await turneringBtn.click()
    await expect(page.getByTestId('menu-dropdown')).toBeVisible()

    await turneringBtn.click()
    await expect(page.getByTestId('menu-dropdown')).not.toBeVisible()
  })
})

test.describe('Context menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')
    await expect(page.getByTestId('data-table')).toBeVisible()
  })

  test('right-click game row shows context menu', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })

    const ctxMenu = page.locator('.context-menu')
    await expect(ctxMenu).toBeVisible()
  })

  test('context menu contains all result items', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })

    const ctxMenu = page.locator('.context-menu')
    await expect(ctxMenu).toBeVisible()

    await expect(ctxMenu.getByText('Ej spelad')).toBeVisible()
    await expect(ctxMenu.getByText('Vit vinst', { exact: true }).first()).toBeVisible()
    await expect(ctxMenu.getByText('Remi')).toBeVisible()
    await expect(ctxMenu.getByText('Svart vinst', { exact: true }).first()).toBeVisible()
    await expect(ctxMenu.getByText('Walk over')).toBeVisible()
    await expect(ctxMenu.getByText('Uppskjuten')).toBeVisible()
    await expect(ctxMenu.getByText('Inställd')).toBeVisible()
    await expect(ctxMenu.getByText('Editera poäng')).toBeVisible()
  })

  test('Walk over item shows submenu arrow', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })

    const ctxMenu = page.locator('.context-menu')
    await expect(ctxMenu).toBeVisible()

    // The Walk over button text includes the submenu arrow
    const walkOverBtn = ctxMenu.locator('.context-submenu > button')
    await expect(walkOverBtn).toContainText('Walk over')
    await expect(walkOverBtn).toContainText('▸')
  })

  test('hovering Walk over reveals submenu items', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })

    const ctxMenu = page.locator('.context-menu')
    await expect(ctxMenu).toBeVisible()

    // Submenu items should be hidden initially
    const submenuItems = ctxMenu.locator('.context-submenu-items')
    await expect(submenuItems).not.toBeVisible()

    // Hover over the Walk over submenu
    const walkOverSubmenu = ctxMenu.locator('.context-submenu')
    await walkOverSubmenu.hover()

    // Submenu items should now appear
    await expect(submenuItems).toBeVisible()
    await expect(submenuItems.getByText('Vit vinst')).toBeVisible()
    await expect(submenuItems.getByText('Svart vinst')).toBeVisible()
    await expect(submenuItems.getByText('Dubbel wo')).toBeVisible()
  })

  test('clicking outside context menu closes it', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })

    const ctxMenu = page.locator('.context-menu')
    await expect(ctxMenu).toBeVisible()

    // Click outside the context menu
    await page.getByTestId('menu-bar').click()
    await expect(ctxMenu).not.toBeVisible()
  })

  test('pressing Escape closes context menu', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })

    const ctxMenu = page.locator('.context-menu')
    await expect(ctxMenu).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(ctxMenu).not.toBeVisible()
  })

  test('right-clicking different rows repositions context menu', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')

    // Right-click first row
    await rows.first().click({ button: 'right' })
    const ctxMenu = page.locator('.context-menu')
    await expect(ctxMenu).toBeVisible()

    // Close and right-click a different row
    await page.keyboard.press('Escape')
    await expect(ctxMenu).not.toBeVisible()

    await rows.nth(1).click({ button: 'right' })
    await expect(ctxMenu).toBeVisible()
  })
})

test.describe('Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const $ = apiClient(page)
    const players = [
      { lastName: 'Svensson', firstName: 'Anna', ratingI: 1800 },
      { lastName: 'Johansson', firstName: 'Erik', ratingI: 1750 },
      { lastName: 'Nilsson', firstName: 'Karl', ratingI: 1700 },
      { lastName: 'Lindberg', firstName: 'Maria', ratingI: 1650 },
    ]
    const { tid } = await createTournament(
      $,
      { name: 'Tangentbord-test', pairingSystem: 'Monrad', nrOfRounds: 3 },
      players,
    )
    await pairRound($, tid)
    await page.reload()
    await waitForApi(page)

    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Tangentbord-test')
    await expect(page.getByTestId('data-table')).toBeVisible()
    await expect(page.getByTestId('data-table').locator('tbody tr')).toHaveCount(2)
  })

  test('pressing 1 sets white win result', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const firstRow = rows.first()
    await firstRow.click()
    await expect(firstRow).toHaveClass(/selected/)

    const resultCell = firstRow.locator('.result-cell')

    await page.keyboard.press('1')

    await expect(resultCell).toContainText('1-0')
  })

  test('pressing 0 sets black win result', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const firstRow = rows.first()
    await firstRow.click()
    await expect(firstRow).toHaveClass(/selected/)

    const resultCell = firstRow.locator('.result-cell')

    await page.keyboard.press('0')

    await expect(resultCell).toContainText('0-1')
  })

  test('pressing r sets draw result', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const firstRow = rows.first()
    await firstRow.click()
    await expect(firstRow).toHaveClass(/selected/)

    const resultCell = firstRow.locator('.result-cell')

    await page.keyboard.press('r')

    await expect(resultCell).toContainText('½')
  })

  test('pressing space clears the result', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const firstRow = rows.first()
    await firstRow.click()
    await expect(firstRow).toHaveClass(/selected/)

    const resultCell = firstRow.locator('.result-cell')

    await page.keyboard.press('1')
    await expect(resultCell).toContainText('1-0')

    // Re-select since auto-advance moved to next row (click name cell, not result button)
    await firstRow.locator('td').first().click()
    await expect(firstRow).toHaveClass(/selected/)

    await page.keyboard.press(' ')

    await expect(resultCell).not.toContainText('1-0')
  })

  test('auto-advance selects next row after setting a result', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const firstRow = rows.first()
    const secondRow = rows.nth(1)

    await firstRow.click()
    await expect(firstRow).toHaveClass(/selected/)

    await page.keyboard.press('1')

    await expect(secondRow).toHaveClass(/selected/)
    await expect(firstRow).not.toHaveClass(/selected/)
  })

  test('auto-advance does not go past the last row', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const lastRow = rows.last()

    await lastRow.click()
    await expect(lastRow).toHaveClass(/selected/)

    await page.keyboard.press('1')

    await expect(page.getByTestId('data-table')).toBeVisible()
  })

  test('keyboard shortcuts do not fire when no row is selected', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const firstResultCell = rows.first().locator('.result-cell')
    const originalText = await firstResultCell.textContent()

    await page.keyboard.press('1')

    await expect(firstResultCell).toHaveText(originalText || '')
  })
})
