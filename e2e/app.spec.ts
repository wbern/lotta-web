/* eslint local/no-class-locators: "off" -- structural traversal (.dialog, .result-cell, .context-menu, .tab-header.active) */

import {
  apiClient,
  createTournament,
  HIGHER_RATED_WINS,
  type PlayerInput,
  pairRound,
  seedHeroTournament,
  setResults,
  waitForApi,
} from './api-helpers'
import { expect, test } from './fixtures'
import { selectTournament, waitForTournaments } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await seedHeroTournament(page)
})

test.describe('Mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('no layout element overflows the viewport', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('menu-bar')).toBeVisible()

    const viewportWidth = 375

    const elements = [
      { testId: 'menu-bar', name: 'menu bar' },
      { testId: 'tournament-selector', name: 'tournament selector' },
      { testId: 'tab-headers', name: 'tab headers' },
      { testId: 'status-bar', name: 'status bar' },
    ]

    for (const { testId, name } of elements) {
      const el = page.getByTestId(testId)
      await expect(el).toBeVisible()
      const box = await el.boundingBox()
      expect(box, `${name} should have a bounding box`).not.toBeNull()
      expect(box!.x, `${name} left edge should be >= 0`).toBeGreaterThanOrEqual(0)
      expect(
        box!.x + box!.width,
        `${name} right edge should be <= viewport width (${viewportWidth})`,
      ).toBeLessThanOrEqual(viewportWidth)
    }
  })

  test('dialog content does not overflow the viewport', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('menu-bar')).toBeVisible()

    // Open new tournament dialog
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ny').click()

    const dialog = page.locator('.dialog')
    await expect(dialog).toBeVisible()

    const viewportWidth = 375

    // Check the dialog itself
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox, 'dialog should have a bounding box').not.toBeNull()
    expect(
      dialogBox!.x + dialogBox!.width,
      'dialog right edge should be <= viewport width',
    ).toBeLessThanOrEqual(viewportWidth)

    // Check that dialog body has no horizontal overflow
    const hasOverflow = await dialog
      .locator('.dialog-body')
      .evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(hasOverflow, 'dialog body should not have horizontal scroll').toBe(false)
  })

  test('no visible text on main views renders below 16px', async ({ page }) => {
    // iOS Safari auto-zooms form fields with font-size < 16px. The mobile
    // media query in global.css bumps --font-size-base / --font-size-small
    // to 1rem and overrides every remaining hardcoded sub-16px rule. This
    // test scans every visible element that directly contains text and
    // verifies computed font-size is >= 16px, so any future regression
    // (new hardcoded 14px rule, missed override, etc.) fails loudly.
    const collectSubPixelOffenders = () =>
      page.evaluate(() => {
        type Offender = { tag: string; classes: string; text: string; fontSize: number }
        const issues: Offender[] = []
        const all = document.body.querySelectorAll<HTMLElement>('*')
        for (const el of all) {
          // Playwright video caption overlay injected by fixtures.ts —
          // not part of the app UI.
          if (el.id === 'pw-test-caption') continue
          // Native <option> is rendered by the OS, CSS font-size does not
          // apply the same way and iOS Safari never zooms because of it.
          if (el.tagName === 'OPTION') continue
          // Ignore SVG text — icons are not UI copy.
          if (el instanceof SVGElement) continue
          if (!el.checkVisibility()) continue

          // Only flag elements that directly contain rendered text, not
          // layout wrappers that just happen to contain children with text.
          const hasDirectText = Array.from(el.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
          )
          if (!hasDirectText) continue

          const fontSize = Number.parseFloat(window.getComputedStyle(el).fontSize)
          if (fontSize < 16) {
            issues.push({
              tag: el.tagName,
              classes: el.className.toString().slice(0, 80),
              text: (el.textContent || '').trim().slice(0, 40),
              fontSize,
            })
          }
        }
        return issues
      })

    await page.goto('/')
    await waitForApi(page)

    // Seed a tournament with paired round so all tabs have content to scan.
    const players: PlayerInput[] = [
      { lastName: 'Ödinson', firstName: 'Thor', ratingI: 2100 },
      { lastName: 'Läufeyson', firstName: 'Loki', ratingI: 1950 },
      { lastName: 'Järnsida', firstName: 'Björn', ratingI: 1800 },
      { lastName: 'Åskväder', firstName: 'Odin', ratingI: 1750 },
      { lastName: 'Stormöga', firstName: 'Frej', ratingI: 1600 },
      { lastName: 'Svärdhand', firstName: 'Tyr', ratingI: 1500 },
    ]
    const $ = apiClient(page)
    const { tid } = await createTournament(
      $,
      { name: 'Mobile font test', pairingSystem: 'Monrad', nrOfRounds: 3 },
      players,
    )
    const r1 = await pairRound($, tid)
    await setResults($, tid, 1, r1.games, HIGHER_RATED_WINS)

    // Reload so React Query picks up the seeded tournament.
    await page.goto('/')
    await expect(page.getByTestId('menu-bar')).toBeVisible()

    // Landing (no tournament) — menu, selector, empty-state guidance.
    const landingOffenders = await collectSubPixelOffenders()
    expect(
      landingOffenders,
      `landing view has ${landingOffenders.length} sub-16px elements: ${JSON.stringify(landingOffenders, null, 2)}`,
    ).toEqual([])

    await selectTournament(page, 'Mobile font test')

    const tabs = [
      'Lottning & resultat',
      'Alfabetisk lottning',
      'Ställning',
      'Spelare',
      'Klubbställning',
    ] as const

    for (const tabLabel of tabs) {
      await page.getByTestId('tab-headers').getByText(tabLabel, { exact: true }).click()
      // Wait for content to paint before scanning.
      await expect(page.getByTestId('tab-content')).toBeVisible()
      const offenders = await collectSubPixelOffenders()
      expect(
        offenders,
        `${tabLabel} has ${offenders.length} sub-16px elements: ${JSON.stringify(offenders, null, 2)}`,
      ).toEqual([])
    }
  })
})

test.describe('App smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('loads and shows layout shell', async ({ page }) => {
    // Menu bar
    await expect(page.getByTestId('menu-bar')).toBeVisible()
    await expect(
      page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }),
    ).toBeVisible()
    await expect(page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' })).toBeVisible()
    await expect(
      page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }),
    ).toBeVisible()
    await expect(
      page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }),
    ).toBeVisible()

    // Tournament selector
    await expect(page.getByTestId('tournament-selector')).toBeVisible()

    // Tab headers
    await expect(page.getByTestId('tab-headers').getByText('Lottning & resultat')).toBeVisible()
    await expect(
      page.getByTestId('tab-headers').getByText('Ställning', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByTestId('tab-headers').getByText('Spelare', { exact: true }),
    ).toBeVisible()
    await expect(page.getByTestId('tab-headers').getByText('Klubbställning')).toBeVisible()

    // Empty state when no tournament selected
    await expect(page.getByTestId('empty-state')).toContainText('Ingen turnering vald')

    // Status bar visible
    await expect(page.getByTestId('status-bar')).toBeVisible()
  })

  test('tournament selector populates with tournaments', async ({ page }) => {
    const selector = page.getByTestId('tournament-selector').locator('select').first()
    await expect(selector).toBeVisible()

    // Wait for tournaments to load from API
    await waitForTournaments(page)

    // Should have the --- default + 3 tournaments
    const options = selector.locator('option')
    await expect(options).toHaveCount(4)
    await expect(options.nth(0)).toHaveText('---')
  })

  test('select tournament and see pairings load', async ({ page }) => {
    await selectTournament(page, 'Hjälteturneringen 2025')

    // Status bar should show tournament info
    await expect(page.getByTestId('status-bar')).toContainText('Hjälteturneringen 2025')
  })
})

test.describe('Pairings tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')
    await expect(page.getByTestId('data-table')).toBeVisible()
  })

  test('shows pairings table with games', async ({ page }) => {
    await expect(page.locator('th', { hasText: 'Bord' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Vit spelare' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Resultat' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Svart spelare' })).toBeVisible()

    const rows = page.getByTestId('data-table').locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('select a specific round and see its pairings', async ({ page }) => {
    const roundSelect = page.getByTestId('tournament-selector').locator('select').last()
    await expect(roundSelect).toBeEnabled()
    await roundSelect.selectOption('1')

    // Should show round 1 pairings — 4 games
    const rows = page.getByTestId('data-table').locator('tbody tr')
    await expect(rows).toHaveCount(4)

    // Board 2 has a result (board 1 may have NO_RESULT)
    await expect(rows.nth(1).locator('.result-cell')).not.toHaveText('')
  })

  test('clicking a game row selects it', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click()
    await expect(firstRow).toHaveClass(/selected/)
  })

  test('right-click opens context menu', async ({ page }) => {
    const firstRow = page.getByTestId('data-table').locator('tbody tr').first()
    await firstRow.click({ button: 'right' })

    const ctxMenu = page.locator('.context-menu')
    await expect(ctxMenu).toBeVisible()
    await expect(ctxMenu.getByText('Vit vinst', { exact: true }).first()).toBeVisible()
    await expect(ctxMenu.getByText('Remi')).toBeVisible()
    await expect(ctxMenu.getByText('Svart vinst', { exact: true }).first()).toBeVisible()
    await expect(ctxMenu.getByText('Walk over')).toBeVisible()
  })
})

test.describe('Alphabetical pairing tab', () => {
  test('shows cross-reference matrix', async ({ page }) => {
    await page.goto('/')
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')
    await expect(page.getByTestId('data-table')).toBeVisible()

    await page.getByTestId('tab-headers').getByText('Alfabetisk lottning').click()

    await expect(page.getByTestId('data-table')).toBeVisible()
    await expect(page.locator('th', { hasText: 'Namn' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Klubb' })).toBeVisible()
  })
})

test.describe('Standings tab', () => {
  test('shows standings table', async ({ page }) => {
    await page.goto('/')
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')
    await expect(page.getByTestId('data-table')).toBeVisible()

    await page.getByTestId('tab-headers').getByText('Ställning', { exact: true }).click()

    await expect(page.locator('th', { hasText: 'Plac' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Namn' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Poäng' })).toBeVisible()

    // Should have 8 player rows
    const rows = page.getByTestId('data-table').locator('tbody tr')
    await expect(rows).toHaveCount(8)

    // First place should be Ragnar with a score displayed
    const firstRow = rows.first()
    await expect(firstRow).toContainText('Ragnar')
    // Score cell should have a value (exact score may vary due to shared DB)
    const scoreCell = firstRow.locator('td').last()
    await expect(scoreCell).not.toHaveText('')
  })
})

test.describe('Players tab', () => {
  test('shows player list', async ({ page }) => {
    await page.goto('/')
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')
    await expect(page.getByTestId('data-table')).toBeVisible()

    await page.getByTestId('tab-headers').getByText('Spelare', { exact: true }).click()

    await expect(page.getByTestId('data-table')).toBeVisible()
    const rows = page.getByTestId('data-table').locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })
})

test.describe('Club standings tab', () => {
  test('shows club standings or empty state', async ({ page }) => {
    await page.goto('/')
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')
    await expect(page.getByTestId('data-table')).toBeVisible()

    await page.getByTestId('tab-headers').getByText('Klubbställning').click()

    const content = page.getByTestId('tab-content')
    await expect(content).toBeVisible()
  })
})

test.describe('Tab navigation', () => {
  test('switching tabs updates content', async ({ page }) => {
    await page.goto('/')
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')
    await expect(page.getByTestId('data-table')).toBeVisible()

    // Start on pairings (default)
    await expect(page.getByTestId('tab-headers').locator('.tab-header.active')).toContainText(
      'Lottning & resultat',
    )

    // Switch to standings
    await page.getByTestId('tab-headers').getByText('Ställning', { exact: true }).click()
    await expect(page.getByTestId('tab-headers').locator('.tab-header.active')).toContainText(
      'Ställning',
    )
    await expect(page.locator('th', { hasText: 'Plac' })).toBeVisible()

    // Switch to players
    await page.getByTestId('tab-headers').getByText('Spelare', { exact: true }).click()
    await expect(page.getByTestId('data-table')).toBeVisible()

    // Switch to alphabetical
    await page.getByTestId('tab-headers').getByText('Alfabetisk lottning').click()
    await expect(page.getByTestId('data-table')).toBeVisible()

    // Switch to club standings
    await page.getByTestId('tab-headers').getByText('Klubbställning').click()
    await expect(page.getByTestId('tab-content')).toBeVisible()
  })
})

test.describe('Dialogs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('Settings dialog opens and closes', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Inställningar' }).click()
    await page.getByTestId('menu-dropdown').getByText('Inställningar').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Inställningar')
    await expect(dialog).toContainText('Namnvisning')
    await expect(dialog.locator('select')).toBeVisible()

    // Check Swedish chars render correctly in option text
    await expect(dialog.locator('select option').first()).toContainText('Förnamn')

    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('New tournament dialog opens', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ny').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Turneringsinställningar')
    await expect(dialog).toContainText('Turnering')
    await expect(dialog).toContainText('Lottningssystem')

    // Has two sub-tabs — check by button text within dialog
    await expect(dialog.getByText('Lottningsinställningar')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'FIDE-uppgifter' })).toBeVisible()

    // Switch to FIDE tab
    await dialog.getByRole('button', { name: 'FIDE-uppgifter' }).click()
    await expect(dialog).toContainText('Stad')
    await expect(dialog).toContainText('Federation')
    await expect(dialog).toContainText('Startdatum')

    await dialog.getByRole('button', { name: 'Avbryt' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('Edit tournament dialog opens with data', async ({ page }) => {
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Min Testturnering')
    // Wait for tournament data to load
    await expect(page.getByTestId('status-bar')).toContainText('Min Testturnering')

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Editera').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Turneringsinställningar')

    await dialog.getByRole('button', { name: 'Avbryt' }).click()
  })

  test('Player pool dialog opens', async ({ page }) => {
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }).click()
    await page.getByTestId('menu-dropdown').getByText('Spelarpool', { exact: true }).click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Spelarpool')
    await expect(dialog.getByTestId('data-table')).toBeVisible()

    // Switch to edit tab and verify editor fields
    await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()
    await expect(dialog.getByText('Förnamn')).toBeVisible()
    await expect(dialog.getByText('Efternamn')).toBeVisible()

    await dialog.getByRole('button', { name: 'Stäng' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('Tournament players dialog opens', async ({ page }) => {
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')
    await expect(page.getByTestId('status-bar')).toContainText('Hjälteturneringen 2025')

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }).click()
    await page.getByTestId('menu-dropdown').getByText('Turneringsspelare', { exact: true }).click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Turneringsspelare')

    await dialog.getByRole('button', { name: 'Stäng' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('Delete tournament shows confirm dialog', async ({ page }) => {
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')
    await expect(page.getByTestId('status-bar')).toContainText('Hjälteturneringen 2025')

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
    await page.getByTestId('menu-dropdown').getByText('Ta bort').click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Radera turnering')
    await expect(dialog).toContainText('Hjälteturneringen 2025')

    // Cancel — don't actually delete
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })
})

test.describe('Status bar', () => {
  test('shows tournament info when selected', async ({ page }) => {
    await page.goto('/')
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.selectOption('Hjälteturneringen 2025')

    const statusBar = page.getByTestId('status-bar')
    await expect(statusBar).toContainText('Turnering')
    await expect(statusBar).toContainText('Hjälteturneringen 2025')
    await expect(statusBar).toContainText('Grupp')
  })
})

test.describe('Pairing error handling', () => {
  test('shows error when pairing tournament with no players', async ({ page }) => {
    // Create an empty tournament via API
    await page.goto('/')
    await waitForApi(page)
    const $ = apiClient(page)
    await $.post('/api/tournaments', {
      name: 'Empty Test',
      group: 'TestGroup',
      pairingSystem: 'Monrad',
      nrOfRounds: 5,
    })

    await page.goto('/')
    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await waitForTournaments(page)
    await tournamentSelect.selectOption('Empty Test')

    // Listen for the alert dialog
    const alertPromise = page.waitForEvent('dialog')

    // Open Lotta menu and click "Lotta nästa rond"
    await page.getByRole('button', { name: 'Lotta' }).click()
    await page.getByRole('button', { name: 'Lotta nästa rond' }).click()

    const dialog = await alertPromise
    expect(dialog.message()).toContain('spelare')
    await dialog.accept()
  })
})
