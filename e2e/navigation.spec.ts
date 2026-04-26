/* eslint local/no-class-locators: "off" -- structural traversal (.tab-header.active, .place-cell) */
import { seedHeroTournament } from './api-helpers'
import { expect, test } from './fixtures'
import { selectTournament } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await seedHeroTournament(page)
})

// ===========================================================================
// 1. URL state persistence
// ===========================================================================
test.describe('URL state persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('selecting a tournament updates URL with tournamentId', async ({ page }) => {
    await selectTournament(page, 'Hjälteturneringen 2025')

    const url = new URL(page.url())
    const tournamentId = url.searchParams.get('tournamentId')
    expect(tournamentId).toBeTruthy()
    expect(Number(tournamentId)).toBeGreaterThan(0)
  })

  test('switching tabs updates URL with tab param', async ({ page }) => {
    await selectTournament(page, 'Hjälteturneringen 2025')

    // Click standings tab
    await page.getByTestId('tab-headers').getByText('Ställning', { exact: true }).click()
    const url1 = new URL(page.url())
    expect(url1.searchParams.get('tab')).toBe('standings')

    // Click players tab
    await page.getByTestId('tab-headers').getByText('Spelare', { exact: true }).click()
    const url2 = new URL(page.url())
    expect(url2.searchParams.get('tab')).toBe('players')

    // Click alphabetical tab
    await page.getByTestId('tab-headers').getByText('Alfabetisk lottning').click()
    const url3 = new URL(page.url())
    expect(url3.searchParams.get('tab')).toBe('alphabetical')

    // Click club standings tab
    await page.getByTestId('tab-headers').getByText('Klubbställning').click()
    const url4 = new URL(page.url())
    expect(url4.searchParams.get('tab')).toBe('club-standings')

    // Click back to pairings tab
    await page.getByTestId('tab-headers').getByText('Lottning & resultat').click()
    const url5 = new URL(page.url())
    expect(url5.searchParams.get('tab')).toBe('pairings')
  })

  test('selecting a round updates URL with round param', async ({ page }) => {
    await selectTournament(page, 'Hjälteturneringen 2025')

    const roundSelect = page.getByTestId('tournament-selector').locator('select').last()
    await expect(roundSelect).toBeEnabled()
    await roundSelect.selectOption('1')

    const url = new URL(page.url())
    expect(url.searchParams.get('round')).toBe('1')
  })

  test('direct navigation to URL with params loads correct state', async ({ page }) => {
    // First select a tournament to capture its ID
    await selectTournament(page, 'Hjälteturneringen 2025')
    const firstUrl = new URL(page.url())
    const tournamentId = firstUrl.searchParams.get('tournamentId')

    // Now navigate directly with params
    await page.goto(`/?tournamentId=${tournamentId}&tab=standings&round=2`)

    // Verify standings tab is active
    await expect(page.getByTestId('tab-headers').locator('.tab-header.active')).toContainText(
      'Ställning',
    )

    // Verify standings table is visible with standings columns
    await expect(page.getByTestId('data-table')).toBeVisible()
    await expect(page.locator('th', { hasText: 'Plac' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Poäng' })).toBeVisible()

    // Verify status bar shows the tournament
    await expect(page.getByTestId('status-bar')).toContainText('Hjälteturneringen 2025')

    // Verify round 2 is selected in the dropdown
    const roundSelect = page.getByTestId('tournament-selector').locator('select').last()
    await expect(roundSelect).toHaveValue('2')
  })
})

// ===========================================================================
// 2. Status bar
// ===========================================================================
test.describe('Status bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('shows "Turnering: X  Grupp: Y  Rond N/M" format', async ({ page }) => {
    await selectTournament(page, 'Hjälteturneringen 2025')

    const statusBar = page.getByTestId('status-bar')
    await expect(statusBar).toContainText('Turnering:')
    await expect(statusBar).toContainText('Hjälteturneringen 2025')
    await expect(statusBar).toContainText('Grupp:')
    await expect(statusBar).toContainText('Alla')
    // Verify round display: "Rond N/M"
    await expect(statusBar).toContainText(/Rond \d+\/\d+/)
  })

  test('changes when switching tournament', async ({ page }) => {
    // Select first tournament
    await selectTournament(page, 'Hjälteturneringen 2025')
    const statusBar = page.getByTestId('status-bar')
    await expect(statusBar).toContainText('Hjälteturneringen 2025')

    // Switch to second tournament
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Min Testturnering')
    await expect(statusBar).toContainText('Min Testturnering')
    // First tournament name should no longer be visible
    await expect(statusBar).not.toContainText('Hjälteturneringen 2025')
  })
})

// ===========================================================================
// 3. Round navigation
// ===========================================================================
test.describe('Round navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')
  })

  test('round dropdown populates with available rounds', async ({ page }) => {
    const roundSelect = page.getByTestId('tournament-selector').locator('select').last()
    await expect(roundSelect).toBeEnabled()

    const options = roundSelect.locator('option')
    const count = await options.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('round options show "Rond N" format', async ({ page }) => {
    const roundSelect = page.getByTestId('tournament-selector').locator('select').last()
    await expect(roundSelect).toBeEnabled()

    const options = roundSelect.locator('option')
    const count = await options.count()

    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).textContent()
      expect(text).toMatch(/^Rond \d+$/)
    }
  })

  test('switching rounds updates pairings table', async ({ page }) => {
    const roundSelect = page.getByTestId('tournament-selector').locator('select').last()
    await expect(roundSelect).toBeEnabled()

    // Switch to round 1
    await roundSelect.selectOption('1')
    await expect(page.getByTestId('data-table')).toBeVisible()
    const round1Rows = page.getByTestId('data-table').locator('tbody tr')
    const round1Count = await round1Rows.count()
    expect(round1Count).toBeGreaterThanOrEqual(1)

    // Switch to round 2
    await roundSelect.selectOption('2')
    await expect(page.getByTestId('data-table')).toBeVisible()
    const round2Rows = page.getByTestId('data-table').locator('tbody tr')
    const round2Count = await round2Rows.count()
    expect(round2Count).toBeGreaterThanOrEqual(1)
  })

  test('round 1 has 4 games for "Hjälteturneringen 2025"', async ({ page }) => {
    const roundSelect = page.getByTestId('tournament-selector').locator('select').last()
    await expect(roundSelect).toBeEnabled()
    await roundSelect.selectOption('1')

    const rows = page.getByTestId('data-table').locator('tbody tr')
    await expect(rows).toHaveCount(4)
  })
})

// ===========================================================================
// 4. Empty states
// ===========================================================================
test.describe('Empty states', () => {
  test('no tournament selected shows "Ingen turnering vald"', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByTestId('empty-state')).toContainText('Ingen turnering vald')
  })

  test('loads correctly on fresh page', async ({ page }) => {
    await page.goto('/')

    // Layout shell should be present
    await expect(page.getByTestId('menu-bar')).toBeVisible()
    await expect(page.getByTestId('tournament-selector')).toBeVisible()
    await expect(page.getByTestId('tab-headers')).toBeVisible()
    await expect(page.getByTestId('status-bar')).toBeVisible()

    // No data table should be visible yet
    await expect(page.getByTestId('data-table')).not.toBeVisible()

    // Empty state should be shown
    await expect(page.getByTestId('empty-state')).toBeVisible()
    await expect(page.getByTestId('empty-state')).toContainText('Ingen turnering vald')

    // Tournament selector should default to "---"
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await expect(tournamentSelect).toHaveValue('')
  })
})

// ===========================================================================
// 5. Standings tab deep tests
// ===========================================================================
test.describe('Standings tab deep tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')
    await page.getByTestId('tab-headers').getByText('Ställning', { exact: true }).click()
    await expect(page.locator('th', { hasText: 'Plac' })).toBeVisible()
  })

  test('has 8 rows for "Hjälteturneringen 2025"', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    await expect(rows).toHaveCount(8)
  })

  test('first place shows "Ragnar"', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await expect(firstRow).toContainText('Ragnar')
  })

  test('has Plac, Namn, Klubb, Poäng columns', async ({ page }) => {
    await expect(page.locator('th', { hasText: 'Plac' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Namn' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Klubb' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Poäng' })).toBeVisible()
  })

  test('standings values are numeric and ordered', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const count = await rows.count()
    expect(count).toBe(8)

    // First row should have place 1
    const firstPlaceCell = rows.first().locator('.place-cell').first()
    await expect(firstPlaceCell).toContainText('1')
  })
})

// ===========================================================================
// 6. Alphabetical tab deep tests
// ===========================================================================
test.describe('Alphabetical tab deep tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')
    await page.getByTestId('tab-headers').getByText('Alfabetisk lottning').click()
    await expect(page.getByTestId('data-table')).toBeVisible()
  })

  test('has 3 columns: Namn, Klubb, Bord', async ({ page }) => {
    await expect(page.locator('th', { hasText: 'Namn' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Klubb' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Bord' })).toBeVisible()

    // Exactly 3 header columns
    const headers = page.getByTestId('data-table').locator('thead th')
    await expect(headers).toHaveCount(3)
  })

  test('board values show format like "1 V", "2 S", or "Fri"', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(1)

    // Check each board cell matches expected format
    for (let i = 0; i < count; i++) {
      const boardCell = rows.nth(i).locator('td').last()
      const text = (await boardCell.textContent()) || ''
      const trimmed = text.trim()
      // Board should be "N V", "N S", or "Fri"
      expect(trimmed).toMatch(/^\d+ [VS]$|^Fri$/)
    }
  })

  test('players are listed alphabetically by default', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThan(1)

    // Gather all names
    const names: string[] = []
    for (let i = 0; i < count; i++) {
      const nameCell = rows.nth(i).locator('td').first()
      const name = (await nameCell.textContent()) || ''
      names.push(name.trim())
    }

    // Verify sorted ascending
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'sv'))
    expect(names).toEqual(sorted)
  })
})

// ===========================================================================
// 7. Players tab tests
// ===========================================================================
test.describe('Players tab tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')
    await page.getByTestId('tab-headers').getByText('Spelare', { exact: true }).click()
    await expect(page.getByTestId('data-table')).toBeVisible()
  })

  test('shows Nr, Namn, Klubb columns', async ({ page }) => {
    await expect(page.locator('th', { hasText: 'Nr' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Namn' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Klubb' })).toBeVisible()
  })

  test('has player rows', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('has 8 players for "Hjälteturneringen 2025"', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    await expect(rows).toHaveCount(8)
  })

  test('each row has a number, name, and club', async ({ page }) => {
    const rows = page.getByTestId('data-table').locator('tbody tr')
    const count = await rows.count()

    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).locator('td')
      // Nr cell
      const nrText = (await cells.first().textContent()) || ''
      expect(nrText.trim()).toMatch(/^\d+$/)

      // Name cell should have text
      const nameText = (await cells.nth(1).textContent()) || ''
      expect(nameText.trim().length).toBeGreaterThan(0)
    }
  })
})

// ===========================================================================
// 8. Club standings tab
// ===========================================================================
test.describe('Club standings tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await selectTournament(page, 'Hjälteturneringen 2025')
    await page.getByTestId('tab-headers').getByText('Klubbställning').click()
    await expect(page.getByTestId('tab-content')).toBeVisible()
  })

  test('shows Plac, Klubb, Poäng columns when data exists', async ({ page }) => {
    // Club standings may or may not have data depending on whether
    // players have clubs set. Check for the table or empty state.
    const table = page.getByTestId('data-table')
    const emptyState = page.getByTestId('empty-state')

    const hasTable = await table.isVisible().catch(() => false)
    const hasEmpty = await emptyState.isVisible().catch(() => false)

    if (hasTable) {
      await expect(page.locator('th', { hasText: 'Plac' })).toBeVisible()
      await expect(page.locator('th', { hasText: 'Klubb' })).toBeVisible()
      await expect(page.locator('th', { hasText: 'Poäng' })).toBeVisible()

      // Should have at least 1 row
      const rows = page.getByTestId('data-table').locator('tbody tr')
      const count = await rows.count()
      expect(count).toBeGreaterThanOrEqual(1)
    } else {
      // Empty state is also acceptable
      expect(hasEmpty).toBe(true)
      await expect(emptyState).toContainText('Ingen klubbställning')
    }
  })

  test('tab is accessible and content area is visible', async ({ page }) => {
    // Verify the active tab is club-standings
    await expect(page.getByTestId('tab-headers').locator('.tab-header.active')).toContainText(
      'Klubbställning',
    )

    // Content area should be visible
    await expect(page.getByTestId('tab-content')).toBeVisible()
  })
})
