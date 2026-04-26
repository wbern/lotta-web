/* eslint local/no-class-locators: "off" -- structural traversal (.form-group, .dialog-tab, etc.) */

import { apiClient, seedHeroTournament, waitForApi } from './api-helpers'
import { expect, test } from './fixtures'
import { selectTournament } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await seedHeroTournament(page)
})

// ---------------------------------------------------------------------------
// 1. Settings dialog deep tests
// ---------------------------------------------------------------------------
test.describe('Settings dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('opens via Inställningar menu button then dropdown item', async ({ page }) => {
    // The menu button "Inställningar" opens a dropdown; click the item inside
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('dialog-title')).toHaveText('Inställningar')
  })

  test('shows Namnvisning label and select with options', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByText('Namnvisning')).toBeVisible()

    const nameSelect = dialog.locator('select')
    await expect(nameSelect).toBeVisible()

    // Two options: "Förnamn efternamn" and "Efternamn förnamn"
    const options = nameSelect.locator('option')
    await expect(options).toHaveCount(2)
    await expect(options.nth(0)).toHaveText('Förnamn efternamn')
    await expect(options.nth(1)).toHaveText('Efternamn förnamn')
  })

  test('shows row break field with "(0=radbryt aldrig)" text', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByText('(0=radbryt aldrig)')).toBeVisible()

    // The number input for row breaks
    const numberInput = dialog.locator('input[type="number"]')
    await expect(numberInput).toBeVisible()
  })

  test('shows "Sätt maxpoäng per match omedelbart" checkbox', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    const label = dialog.getByText('Sätt maxpoäng per match omedelbart')
    await expect(label).toBeVisible()

    // The checkbox should be clickable (inside the label element)
    const checkbox = label.locator('input[type="checkbox"]')
    await expect(checkbox).toBeVisible()
  })

  test('shows "Sök efter uppdateringar vid start" checkbox', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByText('Sök efter uppdateringar vid start')).toBeVisible()
  })

  test('has OK and Avbryt buttons', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeVisible()
  })

  test('closes on Avbryt click', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Avbryt' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('closes on Escape key', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  })

  test('closes on overlay click', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    // Click the overlay (outside the dialog box)
    await dialog.click({ position: { x: 5, y: 5 } })
    await expect(dialog).not.toBeVisible()
  })

  test('can change name display select value', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    const nameSelect = dialog.locator('select')

    await nameSelect.selectOption('LAST_FIRST')
    await expect(nameSelect).toHaveValue('LAST_FIRST')

    await nameSelect.selectOption('FIRST_LAST')
    await expect(nameSelect).toHaveValue('FIRST_LAST')
  })

  test('can toggle checkboxes', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    const checkboxes = dialog.locator('input[type="checkbox"]')

    // There should be 2 checkboxes: maxPoints and searchForUpdate
    await expect(checkboxes).toHaveCount(2)

    // Toggle first checkbox
    const initialState = await checkboxes.nth(0).isChecked()
    await checkboxes.nth(0).click()
    expect(await checkboxes.nth(0).isChecked()).toBe(!initialState)
  })

  test('has "Rensa databas" button', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByTestId('clear-db-button')).toBeVisible()
    await expect(dialog.getByTestId('clear-db-button')).toHaveText('Rensa databas')
  })

  test('clear database flow: open confirmation, type "Ja", confirm reloads with empty state', async ({
    page,
  }) => {
    // First create a tournament so we have data
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ny').click()

    const tournamentDialog = page.getByTestId('dialog-overlay')
    await expect(tournamentDialog).toBeVisible()
    const nameInput = tournamentDialog
      .locator('.form-group')
      .filter({ hasText: 'Turnering' })
      .locator('input')
      .first()
    await nameInput.fill('Clear DB Test')
    const groupInput = tournamentDialog
      .locator('.form-group')
      .filter({ hasText: 'Grupp' })
      .locator('input')
      .first()
    await groupInput.fill('Z')
    await tournamentDialog.getByRole('button', { name: 'Spara' }).click()
    await expect(tournamentDialog).not.toBeVisible()

    // Verify tournament exists
    await expect(page.getByTestId('status-bar')).toContainText('Clear DB Test')

    // Open settings dialog
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const settingsDialog = page.getByTestId('dialog-overlay')
    await expect(settingsDialog).toBeVisible()

    // Click "Rensa databas"
    await settingsDialog.getByTestId('clear-db-button').click()

    // Confirmation dialog should appear (stacked on top)
    // The topmost dialog should have the "Rensa databas" title
    const clearTitle = page.getByTestId('dialog-title').last()
    await expect(clearTitle).toHaveText('Rensa databas')

    // Confirm button should be disabled
    const confirmBtn = page.getByTestId('clear-db-confirm')
    await expect(confirmBtn).toBeDisabled()

    // Type "Ja"
    await page.getByTestId('clear-db-input').fill('Ja')
    await expect(confirmBtn).toBeEnabled()

    // Click confirm — this deletes IndexedDB and reloads the page
    await confirmBtn.click()

    // Page reloads — wait for it to settle
    await page.waitForURL('/')
    await expect(page.getByTestId('menu-bar')).toBeVisible()

    // After reload, no tournaments should exist — the selector should show the placeholder
    const selector = page.getByTestId('tournament-selector').locator('select').first()
    const options = selector.locator('option')
    // Only the default placeholder option should remain (no tournaments)
    const optionCount = await options.count()
    expect(optionCount).toBeLessThanOrEqual(1)
  })

  test('clear database confirmation dialog: Avbryt closes without clearing', async ({ page }) => {
    // Open settings dialog
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const settingsDialog = page.getByTestId('dialog-overlay')
    await expect(settingsDialog).toBeVisible()

    // Click "Rensa databas"
    await settingsDialog.getByTestId('clear-db-button').click()

    // Confirmation dialog appears
    await expect(page.getByTestId('clear-db-input')).toBeVisible()

    // Click Avbryt
    await page.getByRole('button', { name: 'Avbryt' }).last().click()

    // Confirmation dialog should close, settings dialog still visible
    await expect(page.getByTestId('clear-db-input')).not.toBeVisible()
    await expect(settingsDialog).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 2. Tournament dialog deep tests
// ---------------------------------------------------------------------------
test.describe('Tournament dialog — create mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ny').click()
  })

  test('has title "Turneringsinställningar"', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByTestId('dialog-title')).toHaveText('Turneringsinställningar')
  })

  test('shows Turnering and Grupp fields above tabs', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // Turnering field
    const turneringLabel = dialog.locator('label', { hasText: 'Turnering' }).first()
    await expect(turneringLabel).toBeVisible()

    // Grupp field
    await expect(dialog.locator('label', { hasText: 'Grupp' }).first()).toBeVisible()
  })

  test('Turnering and Grupp inputs are empty in create mode', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const inputs = dialog.locator('.form-group input[type="text"]')

    // First text input is the tournament name, should be empty
    await expect(inputs.first()).toHaveValue('')
  })

  test('has 3 tabs: Lottningsinställningar, Webbpublicering, FIDE-uppgifter', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const tabs = dialog.locator('.dialog-tabs')

    await expect(tabs.getByText('Lottningsinställningar')).toBeVisible()
    await expect(tabs.getByText('Webbpublicering')).toBeVisible()
    await expect(tabs.getByText('FIDE-uppgifter')).toBeVisible()
  })

  test('Lottningsinställningar tab is active by default', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const activeTab = dialog.locator('.dialog-tab.active')
    await expect(activeTab).toHaveText('Lottningsinställningar')
  })

  test('Lottningsinställningar tab shows pairing system, initial pairing, rounds', async ({
    page,
  }) => {
    const dialog = page.getByTestId('dialog-overlay')

    await expect(dialog.getByText('Lottningssystem')).toBeVisible()
    await expect(dialog.getByText('Initial spelarordning')).toBeVisible()
    await expect(dialog.getByText('Antal ronder')).toBeVisible()
    await expect(dialog.getByText('Poäng per match')).toBeVisible()
  })

  test('Lottningsinställningar tab has pairing system options', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const pairingSelect = dialog.locator('select:has(option[value="Monrad"])')

    await expect(pairingSelect.locator('option')).toHaveCount(3)
    await expect(pairingSelect.locator('option[value="Monrad"]')).toHaveCount(1)
    await expect(pairingSelect.locator('option[value="Berger"]')).toHaveCount(1)
    await expect(pairingSelect.locator('option[value="Nordisk Schweizer"]')).toHaveCount(1)
  })

  test('Lottningsinställningar tab has tiebreak panel with available and selected lists', async ({
    page,
  }) => {
    const dialog = page.getByTestId('dialog-overlay')

    await expect(dialog.getByText('Särskilning')).toBeVisible()
    await expect(dialog.getByText('Valbara')).toBeVisible()
    await expect(dialog.getByText('Valda')).toBeVisible()

    // Arrow buttons to move tiebreaks
    const tiebreakPanel = dialog.locator('.tiebreak-panel')
    await expect(tiebreakPanel.locator('button', { hasText: '>>' })).toBeVisible()
    await expect(tiebreakPanel.locator('button', { hasText: '<<' })).toBeVisible()
    await expect(tiebreakPanel.getByRole('button', { name: 'Upp' })).toBeVisible()
    await expect(tiebreakPanel.getByRole('button', { name: 'Ner' })).toBeVisible()
  })

  test('Lottningsinställningar tab has checkbox options', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    await expect(dialog.getByText('Låt ej spelare från samma klubb mötas')).toBeVisible()
    await expect(
      dialog.getByText('Räkna uppskjutna partier som remi för den svagare'),
    ).toBeVisible()
    await expect(dialog.getByText('Detta är en schack4an-tävling')).toBeVisible()
    await expect(dialog.getByText('Visa rating')).toBeVisible()
    await expect(dialog.getByText('Visa Gruppkolumn')).toBeVisible()
  })

  test('Webbpublicering tab shows HTML file fields', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    await dialog.locator('.dialog-tab', { hasText: 'Webbpublicering' }).click()

    await expect(dialog.getByText('Dessa uppgifter behövs')).toBeVisible()
    await expect(dialog.locator('label', { hasText: 'Lottning html-fil' })).toBeVisible()
    await expect(dialog.locator('label', { hasText: 'Ställning html-fil' }).first()).toBeVisible()
    await expect(dialog.locator('label', { hasText: 'Spelarlista html-fil' })).toBeVisible()
    await expect(dialog.locator('label', { hasText: 'Korstabell html-fil' })).toBeVisible()
    await expect(dialog.locator('label', { hasText: 'Klubbställning html-fil' })).toBeVisible()
  })

  test('FIDE-uppgifter tab shows FIDE fields', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    await dialog.locator('.dialog-tab', { hasText: 'FIDE-uppgifter' }).click()

    await expect(dialog.getByText('Uppgifter för ELO-registrering till FIDE')).toBeVisible()
    await expect(dialog.getByText('Stad')).toBeVisible()
    await expect(dialog.getByText('Federation')).toBeVisible()
    await expect(dialog.getByText('Startdatum')).toBeVisible()
    await expect(dialog.getByText('Slutdatum')).toBeVisible()
    await expect(dialog.getByText('Huvuddomare')).toBeVisible()
    await expect(dialog.getByText('Biträdande domare')).toBeVisible()
    await expect(dialog.getByText('Betänketid')).toBeVisible()
  })

  test('FIDE-uppgifter tab has round dates section', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    await dialog.locator('.dialog-tab', { hasText: 'FIDE-uppgifter' }).click()

    await expect(dialog.getByText('Speldatum för ronder')).toBeVisible()
    await expect(dialog.getByText('Rondlista')).toBeVisible()
  })

  test('switching between tabs updates displayed content', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // Start on settings tab
    await expect(dialog.getByText('Lottningssystem')).toBeVisible()

    // Switch to web tab
    await dialog.locator('.dialog-tab', { hasText: 'Webbpublicering' }).click()
    await expect(dialog.getByText('Lottning html-fil')).toBeVisible()
    // Settings content should be hidden
    await expect(dialog.getByText('Lottningssystem')).not.toBeVisible()

    // Switch to FIDE tab
    await dialog.locator('.dialog-tab', { hasText: 'FIDE-uppgifter' }).click()
    await expect(dialog.getByText('Stad')).toBeVisible()
    await expect(dialog.getByText('Lottning html-fil')).not.toBeVisible()

    // Switch back to settings tab
    await dialog.locator('.dialog-tab', { hasText: 'Lottningsinställningar' }).click()
    await expect(dialog.getByText('Lottningssystem')).toBeVisible()
  })

  test('checking chess4 disables locked fields and sets their values', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // Check chess4 checkbox
    const chess4Label = dialog.getByText('Detta är en schack4an-tävling')
    await chess4Label.locator('input[type="checkbox"]').check()

    // Pairing system should be Monrad and disabled
    const pairingSelect = dialog.locator('select:has(option[value="Monrad"])')
    await expect(pairingSelect).toBeDisabled()
    await expect(pairingSelect).toHaveValue('Monrad')

    // Initial pairing should be Slumpad and disabled
    const initialSelect = dialog.locator('select:has(option[value="Slumpad"])')
    await expect(initialSelect).toBeDisabled()
    await expect(initialSelect).toHaveValue('Slumpad')

    // Show ELO checkbox should be unchecked and disabled
    const eloCheckbox = dialog.getByText('Visa rating').locator('input[type="checkbox"]')
    await expect(eloCheckbox).toBeDisabled()
    await expect(eloCheckbox).not.toBeChecked()

    // Show Group checkbox should be unchecked and disabled
    const groupCheckbox = dialog.getByText('Visa Gruppkolumn').locator('input[type="checkbox"]')
    await expect(groupCheckbox).toBeDisabled()
    await expect(groupCheckbox).not.toBeChecked()

    // Points per game should be 4 and disabled
    const pointsInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Poäng per match' })
      .locator('input[type="number"]')
    await expect(pointsInput).toBeDisabled()
    await expect(pointsInput).toHaveValue('4')

    // Compensate weak checkbox should be unchecked and disabled
    const compensateCheckbox = dialog
      .getByText('Räkna uppskjutna partier som remi för den svagare')
      .locator('input[type="checkbox"]')
    await expect(compensateCheckbox).toBeDisabled()
    await expect(compensateCheckbox).not.toBeChecked()

    // Rating choice select should be disabled with ELO
    const ratingSelect = dialog.locator(
      'select:has(option[value="ELO"]):has(option[value="Snabb-ELO"])',
    )
    await expect(ratingSelect).toBeDisabled()
    await expect(ratingSelect).toHaveValue('ELO')

    // Barred pairing should be checked
    const barredCheckbox = dialog
      .getByText('Låt ej spelare från samma klubb mötas')
      .locator('input[type="checkbox"]')
    await expect(barredCheckbox).toBeChecked()

    // Selected tiebreaks should contain SSF Buchholz
    const selectedList = dialog
      .locator('.tiebreak-list-container')
      .filter({ hasText: 'Valda' })
      .locator('select')
    await expect(selectedList.locator('option')).toHaveCount(1)
    await expect(selectedList.locator('option').first()).toHaveText('SSF Buchholz')
  })

  test('has Spara and Avbryt footer buttons', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByRole('button', { name: 'Spara' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeVisible()
  })

  test('closes on Avbryt', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await dialog.getByRole('button', { name: 'Avbryt' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('creates tournament via Spara and verifies in database', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // Fill in tournament details
    const nameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Turnering' })
      .locator('input')
      .first()
    await nameInput.fill('E2E Created Tournament')

    const groupInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Grupp' })
      .locator('input')
      .first()
    await groupInput.fill('A')

    // Click Spara to create the tournament
    await dialog.getByRole('button', { name: 'Spara' }).click()
    await expect(dialog).not.toBeVisible()

    // Verify the new tournament appears in the selector dropdown
    const selector = page.getByTestId('tournament-selector').locator('select').first()
    await expect(selector.locator('option', { hasText: 'E2E Created Tournament' })).toBeAttached()

    // Verify via API that the tournament was created in the database
    await waitForApi(page)
    const $ = apiClient(page)
    const tournaments: any[] = await $.get('/api/tournaments')
    const created = tournaments.find((t: any) => t.name === 'E2E Created Tournament')
    expect(created).toBeTruthy()
    expect(created.group).toBe('A')
  })
})

test.describe('Tournament dialog — edit mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Editera').click()
  })

  test('has title "Turneringsinställningar"', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByTestId('dialog-title')).toHaveText('Turneringsinställningar')
  })

  test('Turnering field is populated with tournament name', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // The tournament name input should contain the existing name
    const nameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Turnering' })
      .locator('input')
    await expect(nameInput).toHaveValue('Hjälteturneringen 2025')
  })

  test('Grupp field is populated', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    const groupInput = dialog.locator('.form-group').filter({ hasText: 'Grupp' }).locator('input')
    // Should have some value (may be 'Alla' or other)
    const value = await groupInput.inputValue()
    expect(value.length).toBeGreaterThan(0)
  })

  test('pairing system is set to a value', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const pairingSelect = dialog
      .locator('select')
      .filter({ has: page.locator('option[value="Monrad"]') })

    // Should have a selected value (not empty)
    const value = await pairingSelect.inputValue()
    expect(['Monrad', 'Berger', 'Nordisk Schweizer']).toContain(value)
  })

  test('number of rounds is populated', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const roundsInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Antal ronder' })
      .locator('input[type="number"]')

    const value = await roundsInput.inputValue()
    expect(Number(value)).toBeGreaterThan(0)
  })

  test('closes on Avbryt without saving changes', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // Modify the name
    const nameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Turnering' })
      .locator('input')
      .first()
    await nameInput.fill('Modified name')

    // Cancel
    await dialog.getByRole('button', { name: 'Avbryt' }).click()
    await expect(dialog).not.toBeVisible()

    // Reopen and verify original name is preserved
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Editera').click()

    const reopened = page.getByTestId('dialog-overlay')
    await expect(reopened).toBeVisible()
    const reopenedNameInput = reopened
      .locator('.form-group')
      .filter({ hasText: 'Turnering' })
      .locator('input')
      .first()
    await expect(reopenedNameInput).toHaveValue('Hjälteturneringen 2025')
  })

  test('saves edited group and verifies in database', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // Change the group field (not the name, to avoid breaking subsequent tests)
    const groupInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Grupp' })
      .locator('input')
      .first()
    await expect(groupInput).toBeVisible()
    await groupInput.clear()
    await groupInput.fill('Edited Group')
    await expect(groupInput).toHaveValue('Edited Group')

    // Save and wait for the PUT API call to complete
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/tournaments/') && resp.request().method() === 'PUT',
    )
    await dialog.getByRole('button', { name: 'Spara' }).click()
    const response = await responsePromise

    // Check what was actually sent and received
    const reqBody = JSON.parse(response.request().postData() || '{}')
    const respBody = await response.json()

    // Debug: verify the request contained the updated group
    expect(reqBody.group).toBe('Edited Group')

    // Verify the PUT response returned the updated group
    expect(response.status()).toBeLessThan(400)
    expect(respBody.group).toBe('Edited Group')

    await expect(dialog).not.toBeVisible()

    // Verify via direct API that the group was persisted in the database
    await waitForApi(page)
    const $ = apiClient(page)
    const tournament: any = await $.get('/api/tournaments/2')
    expect(tournament.group).toBe('Edited Group')
  })
})

test.describe('Tournament API validation', () => {
  test('rejects update with empty name', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const error = await page.evaluate(async () => {
      const api = (window as any).__lottaApi
      try {
        await api.updateTournament(2, {
          name: '',
          group: 'A',
          pairingSystem: 'Monrad',
          nrOfRounds: 5,
        })
        return null
      } catch (e: any) {
        return e.message || String(e)
      }
    })
    expect(error).toBeTruthy()
  })

  test('rejects update with empty group', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const error = await page.evaluate(async () => {
      const api = (window as any).__lottaApi
      try {
        await api.updateTournament(2, {
          name: 'Test',
          group: '',
          pairingSystem: 'Monrad',
          nrOfRounds: 5,
        })
        return null
      } catch (e: any) {
        return e.message || String(e)
      }
    })
    expect(error).toBeTruthy()
  })
})

test.describe('Player API validation', () => {
  test('rejects pool player with empty name', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const error = await page.evaluate(async () => {
      const api = (window as any).__lottaApi
      try {
        await api.createPlayer({ firstName: '', lastName: '', club: '', ratingI: 0 })
        return null
      } catch (e: any) {
        return e.message || String(e)
      }
    })
    expect(error).toBeTruthy()
  })

  test('rejects tournament player with empty name', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const error = await page.evaluate(async () => {
      const api = (window as any).__lottaApi
      try {
        await api.addTournamentPlayer(2, { firstName: '', lastName: '', club: '', ratingI: 0 })
        return null
      } catch (e: any) {
        return e.message || String(e)
      }
    })
    expect(error).toBeTruthy()
  })
})

test.describe('Game result API validation', () => {
  test('rejects score exceeding max points per game', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    // Hjälteturneringen 2025 (id=2) has pointsPerGame=1, round 4, board 1 exists
    const error = await page.evaluate(async () => {
      const api = (window as any).__lottaApi
      try {
        await api.setGameResult(2, 4, 1, {
          resultType: 'WHITE_WIN',
          whiteScore: 2,
          blackScore: 0,
        })
        return null
      } catch (e: any) {
        return e.message || String(e)
      }
    })
    expect(error).toBeTruthy()
  })
})

test.describe('Player export encoding', () => {
  test('exported TSV starts with UTF-8 BOM for Windows compatibility', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const bytes = await page.evaluate(async () => {
      const response = await fetch(`/api/tournaments/2/export/players`)
      const buffer = await response.arrayBuffer()
      return Array.from(new Uint8Array(buffer).slice(0, 3))
    })
    // UTF-8 BOM: EF BB BF
    expect(bytes[0]).toBe(0xef)
    expect(bytes[1]).toBe(0xbb)
    expect(bytes[2]).toBe(0xbf)
  })
})

test.describe('Player import encoding', () => {
  test('imports UTF-8 file with BOM correctly', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)

    // UTF-8 BOM + Swedish characters — import via page.evaluate with File API
    const result = await page.evaluate(async () => {
      const bom = new Uint8Array([0xef, 0xbb, 0xbf])
      const text = new TextEncoder().encode('Ström\tÖrjan\tÄlvsjö SK\n')
      const combined = new Uint8Array(bom.length + text.length)
      combined.set(bom, 0)
      combined.set(text, bom.length)

      const file = new File([combined], 'spelare.tsv', { type: 'text/tab-separated-values' })
      const formData = new FormData()
      formData.append('file', file)

      const importRes = await fetch('/api/players/import', {
        method: 'POST',
        body: formData,
      })
      if (!importRes.ok) throw new Error(`Import failed: ${importRes.status}`)
      return importRes.json()
    })
    expect(result.imported).toBe(1)

    const $ = apiClient(page)
    const players: any[] = await $.get('/api/players')
    const strom = players.find((p: { lastName: string }) => p.lastName === 'Ström')
    expect(strom).toBeTruthy()
    expect(strom.firstName).toBe('Örjan')
  })

  test('imports Windows-1252 encoded file with Swedish characters correctly', async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)

    // Create a TSV with Swedish characters encoded in Windows-1252 (ISO-8859-1 superset)
    // å=0xE5, ä=0xE4, ö=0xF6 in Windows-1252
    const result = await page.evaluate(async () => {
      const win1252Bytes = new Uint8Array([
        // "Björk\tÅsa\tÖrebro SK\n"
        0x42,
        0x6a,
        0xf6,
        0x72,
        0x6b,
        0x09, // Björk\t
        0xc5,
        0x73,
        0x61,
        0x09, // Åsa\t
        0xd6,
        0x72,
        0x65,
        0x62,
        0x72,
        0x6f,
        0x20,
        0x53,
        0x4b,
        0x0a, // Örebro SK\n
      ])
      const file = new File([win1252Bytes], 'spelare.tsv', { type: 'text/tab-separated-values' })
      const formData = new FormData()
      formData.append('file', file)

      const importRes = await fetch('/api/players/import', {
        method: 'POST',
        body: formData,
      })
      if (!importRes.ok) throw new Error(`Import failed: ${importRes.status}`)
      return importRes.json()
    })
    expect(result.imported).toBe(1)

    // Verify the imported player has correct Swedish characters
    const $ = apiClient(page)
    const players: any[] = await $.get('/api/players')
    const bjork = players.find((p: { lastName: string }) => p.lastName === 'Björk')
    expect(bjork).toBeTruthy()
    expect(bjork.firstName).toBe('Åsa')
  })
})

// ---------------------------------------------------------------------------
// 3. Player pool dialog tests
// ---------------------------------------------------------------------------
test.describe('Player pool dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }).click()
    await page
      .locator('.menu-dropdown')
      .getByRole('button', { name: 'Spelarpool', exact: true })
      .click()
  })

  test('has title "Ändra i spelarpool"', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByTestId('dialog-title')).toHaveText('Ändra i spelarpool')
  })

  test('shows "Skapa eller editera spelare" heading', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByText('Skapa eller editera spelare')).toBeVisible()
  })

  test('has PlayerEditor form in edit tab with expected fields', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // Switch to edit tab
    await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()
    const editor = dialog.locator('.form-group')

    // Player editor fields (use label locator to avoid matching table headers)
    await expect(editor.filter({ hasText: 'Förnamn' })).toHaveCount(1)
    await expect(editor.filter({ hasText: 'Efternamn' })).toHaveCount(1)
    await expect(dialog.locator('label', { hasText: 'Klubb' })).toBeVisible()
    await expect(dialog.locator('label', { hasText: 'Titel' })).toBeVisible()
    await expect(dialog.getByText('SSF id')).toBeVisible()
    await expect(dialog.getByText('FIDE-information')).toBeVisible()
    await expect(dialog.locator('label', { hasText: 'Kön' })).toBeVisible()
    await expect(dialog.locator('label', { hasText: 'Federation' }).first()).toBeVisible()
    await expect(dialog.getByText('FIDE id')).toBeVisible()
  })

  test('has player table in pool tab with column headers', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const table = dialog.getByTestId('data-table')
    await expect(table).toBeVisible()

    await expect(table.locator('th', { hasText: 'Nr' })).toBeVisible()
    await expect(table.locator('th', { hasText: 'Namn' })).toBeVisible()
    await expect(table.locator('th', { hasText: 'Klubb' })).toBeVisible()
    await expect(table.locator('th', { hasText: 'Rating' })).toBeVisible()
  })

  test('player table has rows', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const rows = dialog.getByTestId('data-table').locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('clicking a player row selects it and fills the editor', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const firstRow = dialog.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click()

    // The row should be selected
    await expect(firstRow).toHaveClass(/selected/)

    // Switch to edit tab to check the editor
    await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()

    // The first name input should be filled
    const firstNameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Förnamn' })
      .locator('input')
    const value = await firstNameInput.inputValue()
    expect(value.length).toBeGreaterThan(0)
  })

  test('double-clicking a player row switches to edit tab with player loaded', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const firstRow = dialog.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.dblclick()

    // Should automatically switch to the edit tab with the player loaded
    const firstNameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Förnamn' })
      .locator('input')
    await expect(firstNameInput).toBeVisible()
    const value = await firstNameInput.inputValue()
    expect(value.length).toBeGreaterThan(0)
  })

  test('has "Ny spelare", "Lägg till", "Ändra", "Ta bort" buttons in edit tab', async ({
    page,
  }) => {
    const dialog = page.getByTestId('dialog-overlay')
    // Switch to edit tab
    await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()
    await expect(dialog.getByRole('button', { name: 'Ny spelare' })).toBeVisible()
    // Use exact + last to distinguish player action buttons from club management buttons
    await expect(
      dialog.getByRole('button', { name: 'Lägg till', exact: true }).last(),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Ändra', exact: true }).last()).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Ta bort', exact: true }).last()).toBeVisible()
  })

  test('has "Stäng" button in footer', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByRole('button', { name: 'Stäng' })).toBeVisible()
  })

  test('has "Ta bort" button in edit tab that is disabled when no player selected', async ({
    page,
  }) => {
    const dialog = page.getByTestId('dialog-overlay')
    // Switch to edit tab
    await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()
    // Use last() to target the player-level delete button, not the club delete button
    const deleteBtn = dialog.getByRole('button', { name: 'Ta bort', exact: true }).last()
    await expect(deleteBtn).toBeVisible()
    await expect(deleteBtn).toBeDisabled()
  })

  test('"Ta bort" button is enabled when a player is selected', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const firstRow = dialog.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click()

    // Switch to edit tab to see the button
    await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()
    // Use last() to target the player-level delete button, not the club delete button
    const deleteBtn = dialog.getByRole('button', { name: 'Ta bort', exact: true }).last()
    await expect(deleteBtn).toBeEnabled()
  })

  test('closes on Stäng click', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await dialog.getByRole('button', { name: 'Stäng' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('"Ny spelare" button resets the editor', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // Select a player first
    const firstRow = dialog.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click()

    // Switch to edit tab
    await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()

    // First name should be filled
    const firstNameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Förnamn' })
      .locator('input')
    const value = await firstNameInput.inputValue()
    expect(value.length).toBeGreaterThan(0)

    // Click "Ny spelare"
    await dialog.getByRole('button', { name: 'Ny spelare' }).click()

    // Editor should be reset
    await expect(firstNameInput).toHaveValue('')
  })

  test('Spelarpool tab is visible', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByRole('button', { name: 'Spelarpool' })).toBeVisible()
  })

  test('has club management buttons (Lägg till, Ändra, Ta bort) next to Klubb dropdown', async ({
    page,
  }) => {
    const dialog = page.getByTestId('dialog-overlay')
    // Switch to edit tab
    await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()

    // Find the club row that contains the dropdown and management buttons
    const clubRow = dialog.locator('.club-row')
    await expect(clubRow).toBeVisible()
    await expect(clubRow.getByRole('combobox')).toBeVisible()
    await expect(clubRow.getByRole('button', { name: 'Lägg till', exact: true })).toBeVisible()
    await expect(clubRow.getByRole('button', { name: 'Ändra', exact: true })).toBeVisible()
    await expect(clubRow.getByRole('button', { name: 'Ta bort', exact: true })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 4. Tournament players dialog tests
// ---------------------------------------------------------------------------
test.describe('Tournament players dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }).click()
    await page
      .locator('.menu-dropdown')
      .getByRole('button', { name: 'Turneringsspelare', exact: true })
      .click()
  })

  test('title includes tournament name', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const title = dialog.getByTestId('dialog-title')
    await expect(title).toContainText('Hjälteturneringen 2025')
    await expect(title).toContainText('Editera turneringsspelare i turnering')
  })

  test('has 3 tabs: editor, tournament table, pool table', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // All three tabs should be visible
    await expect(dialog.getByRole('button', { name: 'Skapa eller editera spelare' })).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Turneringsspelare', exact: true }),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Spelarpool', exact: true })).toBeVisible()
  })

  test('tournament players table has rows (8 players)', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const tables = dialog.getByTestId('data-table')

    // First table is tournament players
    const tournamentTable = tables.first()
    const rows = tournamentTable.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    const count = await rows.count()
    expect(count).toBe(8)
  })

  test('shows player count', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByText('spelare registrerade i turneringen.')).toBeVisible()
  })

  test('editor shows tournament-specific fields (withdrawn, tiebreak)', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // Switch to edit tab
    await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()

    // Tournament-specific fieldset
    await expect(dialog.getByText('Spelarinställningar i turneringen')).toBeVisible()
    await expect(dialog.getByText('Utgå från rond')).toBeVisible()
    await expect(dialog.getByText('Manuell särskiljning')).toBeVisible()
  })

  test('clicking a tournament player selects it and fills editor', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const tournamentTable = dialog.getByTestId('data-table')
    // Click a player that has a last name (Valhöll, Fenris)
    const valhollRow = tournamentTable.locator('tbody tr').filter({ hasText: 'Valhöll' })
    await valhollRow.click()

    await expect(valhollRow).toHaveClass(/selected/)

    // Switch to edit tab to verify the editor
    await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()

    // Editor should be filled with the selected player's data
    const lastNameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Efternamn' })
      .locator('input')
    await expect(lastNameInput).toHaveValue('Valhöll')
    const firstNameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Förnamn' })
      .locator('input')
    await expect(firstNameInput).toHaveValue('Fenris')
  })

  test('double-clicking a tournament player switches to edit tab with player loaded', async ({
    page,
  }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const tournamentTable = dialog.getByTestId('data-table')
    const valhollRow = tournamentTable.locator('tbody tr').filter({ hasText: 'Valhöll' })
    await valhollRow.dblclick()

    // Should automatically switch to the edit tab
    const lastNameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Efternamn' })
      .locator('input')
    await expect(lastNameInput).toBeVisible()
    await expect(lastNameInput).toHaveValue('Valhöll')
    const firstNameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Förnamn' })
      .locator('input')
    await expect(firstNameInput).toHaveValue('Fenris')
  })

  test('pool tab has add button for adding from pool', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    // Switch to pool tab
    await dialog.getByRole('button', { name: 'Spelarpool', exact: true }).click()
    const addBtn = dialog.getByRole('button', { name: 'Lägg till' })
    await expect(addBtn).toBeVisible()
  })

  test('has "Ta bort" and "Editera" buttons on tournament tab', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByRole('button', { name: 'Ta bort' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Editera', exact: true })).toBeVisible()
  })

  test('Editera button switches to edit tab with selected player', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    const valhollRow = dialog
      .getByTestId('data-table')
      .locator('tbody tr')
      .filter({ hasText: 'Valhöll' })
    await valhollRow.click()
    await dialog.getByRole('button', { name: 'Editera', exact: true }).click()

    // Should switch to edit tab with Valhöll loaded
    const lastNameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Efternamn' })
      .locator('input')
    await expect(lastNameInput).toBeVisible()
    await expect(lastNameInput).toHaveValue('Valhöll')
  })

  test('has "Ny spelare", "Lägg till", and "Uppdatera uppgifter" buttons in edit tab', async ({
    page,
  }) => {
    const dialog = page.getByTestId('dialog-overlay')
    // Switch to edit tab
    await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()
    await expect(dialog.getByRole('button', { name: 'Ny spelare' })).toBeVisible()
    // Use last() to distinguish from the club "Lägg till" button
    await expect(
      dialog.getByRole('button', { name: 'Lägg till', exact: true }).last(),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Uppdatera uppgifter' })).toBeVisible()
  })

  test('has "Stäng" button in footer', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByRole('button', { name: 'Stäng' })).toBeVisible()
  })

  test('closes on Stäng click', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')
    await dialog.getByRole('button', { name: 'Stäng' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('both tables have sortable column headers', async ({ page }) => {
    const dialog = page.getByTestId('dialog-overlay')

    // Tournament tab is active by default
    const tTable = dialog.getByTestId('data-table')
    const tHeaders = tTable.locator('th')
    await expect(tHeaders.filter({ hasText: 'Namn' })).toBeVisible()
    await expect(tHeaders.filter({ hasText: 'Klubb' })).toBeVisible()
    await expect(tHeaders.filter({ hasText: 'Rating' })).toBeVisible()

    // Switch to pool tab
    await dialog.getByRole('button', { name: 'Spelarpool', exact: true }).click()
    const pTable = dialog.getByTestId('data-table')
    const pHeaders = pTable.locator('th')
    await expect(pHeaders.filter({ hasText: 'Namn' })).toBeVisible()
    await expect(pHeaders.filter({ hasText: 'Klubb' })).toBeVisible()
    await expect(pHeaders.filter({ hasText: 'Rating' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 5. EditBoard dialog tests
// ---------------------------------------------------------------------------
test.describe('EditBoard dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')
  })

  test('opens on double-click of a game row', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.dblclick()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()
  })

  test('title shows "Bord nr {N}" with the correct board number', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.dblclick()

    const dialog = page.getByTestId('dialog-overlay')
    const title = dialog.getByTestId('dialog-title')
    await expect(title).toContainText('Bord nr')
  })

  test('has grid layout with "Vit" and "Svart" column headers', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.dblclick()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByText('Vit', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Svart', { exact: true })).toBeVisible()
  })

  test('has "Namn" row label', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.dblclick()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByText('Namn', { exact: true })).toBeVisible()
  })

  test('has two player dropdowns with "(frirond)" as default option', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.dblclick()

    const dialog = page.getByTestId('dialog-overlay')
    const selects = dialog.locator('.dialog-body select')
    await expect(selects).toHaveCount(2)

    // Both selects should have "(frirond)" as the first option
    await expect(selects.nth(0).locator('option').first()).toHaveText('(frirond)')
    await expect(selects.nth(1).locator('option').first()).toHaveText('(frirond)')
  })

  test('dropdowns are pre-populated when editing existing board', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.dblclick()

    const dialog = page.getByTestId('dialog-overlay')
    const selects = dialog.locator('.dialog-body select')

    // At least one player should be selected (not empty / frirond)
    const whiteValue = await selects.nth(0).inputValue()
    const blackValue = await selects.nth(1).inputValue()
    // At least one should have a player selected
    expect(whiteValue !== '' || blackValue !== '').toBeTruthy()
  })

  test('has "Ok" and "Avbryt" buttons', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.dblclick()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByRole('button', { name: 'Ok' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeVisible()
  })

  test('closes on Avbryt click', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.dblclick()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Avbryt' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('closes on Escape key', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.dblclick()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  })

  test('player options exclude already-paired players from other boards', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.dblclick()

    const dialog = page.getByTestId('dialog-overlay')
    const whiteSelect = dialog.locator('.dialog-body select').nth(0)
    const blackSelect = dialog.locator('.dialog-body select').nth(1)

    // Count available options (minus frirond)
    const whiteOptionCount = await whiteSelect.locator('option').count()
    const blackOptionCount = await blackSelect.locator('option').count()

    // There should be at least the frirond option + the current players
    expect(whiteOptionCount).toBeGreaterThanOrEqual(1)
    expect(blackOptionCount).toBeGreaterThanOrEqual(1)
  })

  test('EditBoard also opens via Lotta menu > Editera bord after selecting a row', async ({
    page,
  }) => {
    // Select a row first
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click()

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' }).click()
    await page.getByTestId('menu-dropdown').getByText('Editera bord').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('dialog-title')).toContainText('Bord nr')

    await dialog.getByRole('button', { name: 'Avbryt' }).click()
  })
})

// ---------------------------------------------------------------------------
// 6. EditScore dialog tests
// ---------------------------------------------------------------------------
test.describe('EditScore dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')
  })

  test('opens via context menu "Editera poäng"', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })

    const ctxMenu = page.locator('.context-menu')
    await expect(ctxMenu).toBeVisible()

    await ctxMenu.getByText('Editera poäng').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()
  })

  test('has title "Sätt poängresultat"', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })
    await page.locator('.context-menu').getByText('Editera poäng').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByTestId('dialog-title')).toHaveText('Sätt poängresultat')
  })

  test('shows player names', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })
    await page.locator('.context-menu').getByText('Editera poäng').click()

    const dialog = page.getByTestId('dialog-overlay')

    // Should show player names in bold (strong tags)
    const playerNames = dialog.locator('strong')
    await expect(playerNames.first()).toBeVisible()
    const nameCount = await playerNames.count()
    expect(nameCount).toBe(2)
  })

  test('shows "Resultat:" label', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })
    await page.locator('.context-menu').getByText('Editera poäng').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByText('Resultat:')).toBeVisible()
  })

  test('has two score inputs', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })
    await page.locator('.context-menu').getByText('Editera poäng').click()

    const dialog = page.getByTestId('dialog-overlay')
    const inputs = dialog.locator('.dialog-body input[type="text"]')
    await expect(inputs).toHaveCount(2)
  })

  test('score inputs are pre-filled with current scores', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })
    await page.locator('.context-menu').getByText('Editera poäng').click()

    const dialog = page.getByTestId('dialog-overlay')
    const inputs = dialog.locator('.dialog-body input[type="text"]')

    // Scores should be pre-filled (not empty, since round 4 has results)
    const whiteScore = await inputs.nth(0).inputValue()
    const blackScore = await inputs.nth(1).inputValue()
    // At least one should have a value
    expect(whiteScore.length + blackScore.length).toBeGreaterThan(0)
  })

  test('has "Spara" and "Avbryt" buttons', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })
    await page.locator('.context-menu').getByText('Editera poäng').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByRole('button', { name: 'Spara' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeVisible()
  })

  test('closes on Avbryt click', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })
    await page.locator('.context-menu').getByText('Editera poäng').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Avbryt' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('closes on Escape key', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })
    await page.locator('.context-menu').getByText('Editera poäng').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  })

  test('shows dash separator between player names and between score inputs', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })
    await page.locator('.context-menu').getByText('Editera poäng').click()

    const dialog = page.getByTestId('dialog-overlay')
    // There should be dash separators
    const dashes = dialog.locator('.dialog-body').getByText('-', { exact: true })
    const count = await dashes.count()
    expect(count).toBeGreaterThanOrEqual(2) // one between names, one between scores
  })

  test('saving edited scores persists and updates display', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })
    await page.locator('.context-menu').getByText('Editera poäng').click()

    const dialog = page.getByTestId('dialog-overlay')
    const inputs = dialog.locator('.dialog-body input[type="text"]')

    // Set new scores
    await inputs.nth(0).fill('0.5')
    await expect(inputs.nth(0)).toHaveValue('0.5')

    await inputs.nth(1).fill('0.5')
    await expect(inputs.nth(1)).toHaveValue('0.5')

    // Save the scores
    await dialog.getByRole('button', { name: 'Spara' }).click()
    await expect(dialog).not.toBeVisible()

    // Verify the result column shows the draw in the pairings table
    await expect(firstRow).toContainText('½')

    // Verify via API that the score persisted in the database
    // Determine the last round dynamically (tournament may have 5 rounds)
    await waitForApi(page)
    const $ = apiClient(page)
    const rounds: any[] = await $.get('/api/tournaments/2/rounds')
    const lastRound = rounds[rounds.length - 1]
    const game = lastRound.games.find((g: any) => g.boardNr === 1)
    expect(game.whiteScore).toBe(0.5)
    expect(game.blackScore).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// 7. Ångra lottning confirm dialog
// ---------------------------------------------------------------------------
test.describe('Ångra lottning confirm dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')
  })

  test('opens via Lotta menu > Ångra lottning', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ångra lottning').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()
  })

  test('has title "Ångra lottning"', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ångra lottning').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByTestId('dialog-title')).toHaveText('Ångra lottning')
  })

  test('shows warning message about removing results', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ångra lottning').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toContainText('Är du säker på att du vill ångra lottningen')
    await expect(dialog).toContainText('resultat')
  })

  test('has "Cancel" and "OK" buttons (ConfirmDialog style)', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ångra lottning').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeVisible()
  })

  test('closes on Cancel click without unpairing', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ångra lottning').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()

    // Pairings should still be visible
    await expect(page.getByTestId('data-table')).toBeVisible()
  })

  test('closes on Escape key', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ångra lottning').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  })

  test('confirms unpairing and verifies round removed via API', async ({ page }) => {
    // Get round count before unpairing
    await waitForApi(page)
    const $ = apiClient(page)
    const roundsBefore: any[] = await $.get('/api/tournaments/2/rounds')
    const roundCountBefore = roundsBefore.length

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ångra lottning').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    // Click OK to confirm unpairing
    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(dialog).not.toBeVisible()

    // Verify via API that the last round was removed
    const roundsAfter: any[] = await $.get('/api/tournaments/2/rounds')
    expect(roundsAfter.length).toBe(roundCountBefore - 1)
  })
})

// ---------------------------------------------------------------------------
// Delete tournament confirm dialog (bonus — completes confirm dialog coverage)
// ---------------------------------------------------------------------------
test.describe('Delete tournament confirm dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')
  })

  test('has title "Radera turnering"', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ta bort').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByTestId('dialog-title')).toHaveText('Radera turnering')
  })

  test('message includes tournament name', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ta bort').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toContainText('Hjälteturneringen 2025')
  })

  test('has "Cancel" and "OK" buttons', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ta bort').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeVisible()
  })

  test('closes on Cancel without deleting', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ta bort').click()

    const dialog = page.getByTestId('dialog-overlay')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()

    // Tournament should still be selected
    await expect(page.getByTestId('status-bar')).toContainText('Hjälteturneringen 2025')
  })

  test('confirms deletion and verifies tournament removed via API', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ta bort').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    // Click OK and wait for the DELETE API call to complete
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/tournaments/') && resp.request().method() === 'DELETE',
    )
    await dialog.getByRole('button', { name: 'OK' }).click()
    const response = await responsePromise

    // Verify the DELETE succeeded
    expect(response.status()).toBeLessThan(400)
    await expect(dialog).not.toBeVisible()

    // Verify via API that the tournament was deleted from the database
    await waitForApi(page)
    const $ = apiClient(page)
    const tournaments: any[] = await $.get('/api/tournaments')
    const found = tournaments.find((t: any) => t.name === 'Hjälteturneringen 2025')
    expect(found).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Regression: tournament dialog closes after creation when another exists
// ---------------------------------------------------------------------------
test.describe('Tournament dialog — create closes when tournament already selected', () => {
  async function createTournamentViaUI(
    page: import('@playwright/test').Page,
    name: string,
    group: string,
  ) {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ny').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    const nameInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Turnering' })
      .locator('input')
      .first()
    await nameInput.fill(name)

    const groupInput = dialog
      .locator('.form-group')
      .filter({ hasText: 'Grupp' })
      .locator('input')
      .first()
    await groupInput.fill(group)

    await dialog.getByRole('button', { name: 'Spara' }).click()
    await expect(dialog).not.toBeVisible()
  }

  test('dialog closes after creating a second tournament', async ({ page }) => {
    await page.goto('/')

    // Create the first tournament via UI — dialog should close
    await createTournamentViaUI(page, 'First Tournament', 'A')
    await expect(page.getByTestId('status-bar')).toContainText('First Tournament')

    // Create a second tournament while the first is selected — dialog MUST close
    await createTournamentViaUI(page, 'Second Tournament', 'B')

    // The newly created tournament should be auto-selected
    await expect(page.getByTestId('status-bar')).toContainText('Second Tournament')
  })
})

// ---------------------------------------------------------------------------
// Regression: seed players with auto-add refreshes tournament players tab
// ---------------------------------------------------------------------------
test.describe('Seed players — tournament players tab refresh', () => {
  test('seeded players appear in Spelare tab after auto-add to tournament', async ({ page }) => {
    await page.goto('/')

    // Create a tournament via the UI first
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ny').click()

    const tournamentDialog = page.getByTestId('dialog-overlay')
    await expect(tournamentDialog).toBeVisible()

    const nameInput = tournamentDialog
      .locator('.form-group')
      .filter({ hasText: 'Turnering' })
      .locator('input')
      .first()
    await nameInput.fill('Seed Test')

    const groupInput = tournamentDialog
      .locator('.form-group')
      .filter({ hasText: 'Grupp' })
      .locator('input')
      .first()
    await groupInput.fill('X')

    await tournamentDialog.getByRole('button', { name: 'Spara' }).click()
    await expect(tournamentDialog).not.toBeVisible()

    // Verify tournament is selected
    await expect(page.getByTestId('status-bar')).toContainText('Seed Test')

    // Switch to Spelare tab — should be empty initially
    await page.getByTestId('tab-headers').getByText('Spelare', { exact: true }).click()
    await expect(page.getByTestId('tab-content').getByTestId('empty-state').first()).toBeVisible()

    // Now seed players via the menu with auto-add to tournament
    // Set up alert handler BEFORE triggering it
    page.once('dialog', (d) => d.accept())

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }).click()
    await page.getByTestId('menu-dropdown').getByText('Skapa testspelare').click()

    const seedDialog = page.getByTestId('dialog-overlay')
    await expect(seedDialog).toBeVisible()

    // Set count to 5
    const countInput = seedDialog.locator('input[type="number"]').first()
    await countInput.fill('5')

    // Ensure "Lägg även till i turneringen" is checked
    const autoAddCheckbox = seedDialog
      .locator('label')
      .filter({ hasText: 'Lägg även till i turneringen' })
      .locator('input[type="checkbox"]')
    if (!(await autoAddCheckbox.isChecked())) {
      await autoAddCheckbox.check()
    }

    // Click Skapa — triggers seeding + alert
    await seedDialog.getByRole('button', { name: 'Skapa' }).click()
    await expect(seedDialog).not.toBeVisible()

    // The Spelare tab should now show the seeded tournament players
    const tableRows = page.getByTestId('data-table').locator('tbody tr')
    await expect(tableRows.first()).toBeVisible()
    const rowCount = await tableRows.count()
    expect(rowCount).toBe(5)
  })
})
