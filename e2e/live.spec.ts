/* eslint local/no-class-locators: "off" -- structural traversal (.live-tab-*, .empty-state-title) */

import {
  apiClient,
  createTournament,
  ensureClubs,
  type PlayerInput,
  pairRound,
  waitForApi,
} from './api-helpers'
import { expect, test } from './fixtures'

const PLAYERS: PlayerInput[] = [
  { lastName: 'Eriksson', firstName: 'Anna', ratingI: 1800 },
  { lastName: 'Svensson', firstName: 'Erik', ratingI: 1700 },
  { lastName: 'Johansson', firstName: 'Karin', ratingI: 1600 },
  { lastName: 'Karlsson', firstName: 'Lars', ratingI: 1500 },
]

const CLUB_TREE_CLUBS = [{ name: 'Skara SK' }, { name: 'Lidköping SS' }]

// Mix of clubbed + clubless players, enough for pairing 3 rounds.
const CLUB_TREE_PLAYERS: PlayerInput[] = [
  { lastName: 'Svensson', firstName: 'Anna', ratingI: 1800 },
  { lastName: 'Lindberg', firstName: 'Maria', ratingI: 1650 },
  { lastName: 'Johansson', firstName: 'Erik', ratingI: 1750 },
  { lastName: 'Nilsson', firstName: 'Karl', ratingI: 1700 },
  { lastName: 'Persson', firstName: 'Nils', ratingI: 1400 },
  { lastName: 'Olsson', firstName: 'Greta', ratingI: 1350 },
]

async function setupTournament(page: import('@playwright/test').Page) {
  await page.goto('/')
  await waitForApi(page)
  const $ = apiClient(page)

  const { tid } = await createTournament(
    $,
    {
      name: 'Live-test',
      pairingSystem: 'Monrad',
      nrOfRounds: 3,
    },
    PLAYERS,
  )
  await pairRound($, tid)

  // Reload so TanStack Query fetches fresh tournament list from IndexedDB
  await page.reload()
  await waitForApi(page)

  // Select tournament and wait for data
  const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
  await tournamentSelect.locator('option', { hasText: 'Live-test' }).waitFor({
    state: 'attached',
  })
  await tournamentSelect.selectOption('Live-test')
  await expect(page.getByTestId('data-table')).toBeVisible()
}

async function goToLiveTab(page: import('@playwright/test').Page) {
  await page.getByTestId('tab-headers').getByText('Live (Beta)').click()
  await expect(page.locator('.live-tab-container')).toBeVisible()
}

async function startHosting(page: import('@playwright/test').Page) {
  await page.locator('button', { hasText: 'Starta Live' }).click()
  await expect(page.locator('.live-tab-hosting')).toBeVisible()
}

// ===========================================================================
// 1. Live tab basics
// ===========================================================================
test.describe('Live tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupTournament(page)
    await goToLiveTab(page)
  })

  test('shows start hosting button initially', async ({ page }) => {
    await expect(page.locator('button', { hasText: 'Starta Live' })).toBeVisible()
    await expect(page.locator('.empty-state-title')).toContainText('Live-delning')
  })

  test('shows hosting UI after starting', async ({ page }) => {
    await startHosting(page)

    await expect(page.locator('button', { hasText: 'Stoppa Live' })).toBeVisible()
    await expect(page.locator('h3')).toContainText('Live: Live-test')
    await expect(page.locator('.live-tab-badge')).toContainText('0 anslutna')
  })

  test('displays spectator QR code and share links', async ({ page }) => {
    await startHosting(page)

    await expect(page.locator('h4', { hasText: 'Dela med åskådare' })).toBeVisible()
    await expect(page.locator('.live-tab-qr')).toBeVisible()
    await expect(page.locator('.live-tab-link-label', { hasText: 'Rumskod:' })).toBeVisible()
    await expect(page.locator('.live-tab-link-label', { hasText: 'Länk:' })).toBeVisible()
  })

  test('shows waiting message when no peers connected', async ({ page }) => {
    await startHosting(page)

    await expect(page.locator('.live-tab-empty')).toContainText('Väntar på anslutningar...')
  })

  test('stops hosting and returns to initial state', async ({ page }) => {
    await startHosting(page)

    await page.locator('button', { hasText: 'Stoppa Live' }).click()
    await expect(page.locator('button', { hasText: 'Starta Live' })).toBeVisible()
    await expect(page.locator('.live-tab-hosting')).not.toBeVisible()
  })
})

// ===========================================================================
// 2. Sub-tab navigation
// ===========================================================================
test.describe('Live sub-tabs', () => {
  test.beforeEach(async ({ page }) => {
    await setupTournament(page)
    await goToLiveTab(page)
    await startHosting(page)
  })

  test('shows Delning and Dela vy sub-tabs when hosting', async ({ page }) => {
    const delning = page.locator('[role="tab"]', { hasText: 'Delning' })
    const delaVy = page.locator('[role="tab"]', { hasText: 'Dela vy' })

    await expect(delning).toBeVisible()
    await expect(delaVy).toBeVisible()
    await expect(delning).toHaveAttribute('aria-selected', 'true')
  })

  test('switching to Dela vy sub-tab shows share link and QR', async ({ page }) => {
    await page.locator('[role="tab"]', { hasText: 'Dela vy' }).click()

    await expect(page.locator('h4', { hasText: 'Dela vy' })).toBeVisible()
    await expect(page.locator('.live-tab-link-label', { hasText: 'Delningslänk:' })).toBeVisible()
    await expect(page.locator('.live-tab-qr')).toBeVisible()
  })

  test('switching between sub-tabs preserves hosting session', async ({ page }) => {
    // Go to Dela vy
    await page.locator('[role="tab"]', { hasText: 'Dela vy' }).click()
    await expect(page.locator('h4', { hasText: 'Dela vy' })).toBeVisible()

    // Back to Delning
    await page.locator('[role="tab"]', { hasText: 'Delning' }).click()
    await expect(page.locator('h4', { hasText: 'Dela med åskådare' })).toBeVisible()

    // Session should still be active
    await expect(page.locator('button', { hasText: 'Stoppa Live' })).toBeVisible()
    await expect(page.locator('.live-tab-badge')).toContainText('anslutna')
  })
})

// ===========================================================================
// 3. Session survives top-level tab switches
// ===========================================================================
test.describe('Live session persistence', () => {
  test.beforeEach(async ({ page }) => {
    await setupTournament(page)
    await goToLiveTab(page)
    await startHosting(page)
  })

  test('session survives switching to another tab and back', async ({ page }) => {
    await expect(page.locator('button', { hasText: 'Stoppa Live' })).toBeVisible()

    // Switch to Pairings tab
    await page.getByTestId('tab-headers').getByText('Lottning & resultat').click()
    await expect(page.getByTestId('data-table')).toBeVisible()

    // Switch back to Live tab
    await goToLiveTab(page)

    // Session should still be active
    await expect(page.locator('button', { hasText: 'Stoppa Live' })).toBeVisible()
    await expect(page.locator('.live-tab-hosting')).toBeVisible()
    await expect(page.locator('button', { hasText: 'Starta Live' })).not.toBeVisible()
  })

  test('session survives switching through multiple tabs', async ({ page }) => {
    // Switch through several tabs
    await page.getByTestId('tab-headers').getByText('Ställning', { exact: true }).click()
    await expect(page.getByTestId('data-table')).toBeVisible()

    await page.getByTestId('tab-headers').getByText('Spelare', { exact: true }).click()
    await expect(page.getByTestId('data-table')).toBeVisible()

    await page.getByTestId('tab-headers').getByText('Alfabetisk lottning').click()
    await expect(page.getByTestId('data-table')).toBeVisible()

    // Return to Live tab
    await goToLiveTab(page)

    // Session should still be active
    await expect(page.locator('button', { hasText: 'Stoppa Live' })).toBeVisible()
    await expect(page.locator('.live-tab-hosting')).toBeVisible()
  })

  test('can stop session after returning from another tab', async ({ page }) => {
    // Switch away
    await page.getByTestId('tab-headers').getByText('Ställning', { exact: true }).click()
    await expect(page.getByTestId('data-table')).toBeVisible()

    // Return to Live
    await goToLiveTab(page)

    // Stop hosting
    await page.locator('button', { hasText: 'Stoppa Live' }).click()
    await expect(page.locator('button', { hasText: 'Starta Live' })).toBeVisible()
  })
})

// ===========================================================================
// 4. Club picker checkbox tree
// ===========================================================================
test.describe('Live club picker tree', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForApi(page)
    const $ = apiClient(page)

    const clubIds = await ensureClubs($, CLUB_TREE_CLUBS)
    // First 2 in Skara, next 2 in Lidköping, last 2 are clubless (clubIndex=0).
    const players = CLUB_TREE_PLAYERS.map((p, i) => ({
      ...p,
      clubIndex: i < 2 ? clubIds[0] : i < 4 ? clubIds[1] : 0,
    }))

    const { tid } = await createTournament(
      $,
      { name: 'Club-tree-test', pairingSystem: 'Monrad', nrOfRounds: 3 },
      players,
    )
    await pairRound($, tid)

    await page.reload()
    await waitForApi(page)

    const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
    await tournamentSelect.locator('option', { hasText: 'Club-tree-test' }).waitFor({
      state: 'attached',
    })
    await tournamentSelect.selectOption('Club-tree-test')
    await expect(page.getByTestId('data-table')).toBeVisible()

    await goToLiveTab(page)
    await startHosting(page)

    await page.getByTestId('club-codes').scrollIntoViewIfNeeded()
  })

  test('shows "Alla" parent with clubs and Klubblösa nested as children', async ({ page }) => {
    await expect(page.getByRole('checkbox', { name: /^Alla/ })).toBeVisible()

    const children = page.getByTestId('club-picker-children')
    await expect(children.getByRole('checkbox', { name: /^Skara SK/ })).toBeVisible()
    await expect(children.getByRole('checkbox', { name: /^Lidköping SS/ })).toBeVisible()
    await expect(children.getByRole('checkbox', { name: /^Klubblösa/ })).toBeVisible()

    // Parent is outside the children container
    await expect(children.getByRole('checkbox', { name: /^Alla/ })).toHaveCount(0)
  })

  test('parent checkbox becomes indeterminate when some children are selected', async ({
    page,
  }) => {
    const parent = page.getByRole('checkbox', { name: /^Alla/ })

    // Initial state: nothing selected
    await expect(parent).not.toBeChecked()
    expect(await parent.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(false)

    // Select one child → parent indeterminate
    await page.getByRole('checkbox', { name: /^Skara SK/ }).check()
    await expect(parent).not.toBeChecked()
    expect(await parent.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true)

    // Select all children → parent checked, not indeterminate
    await page.getByRole('checkbox', { name: /^Lidköping SS/ }).check()
    await page.getByRole('checkbox', { name: /^Klubblösa/ }).check()
    await expect(parent).toBeChecked()
    expect(await parent.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(false)
  })

  test('toggling parent checks and unchecks all children', async ({ page }) => {
    const parent = page.getByRole('checkbox', { name: /^Alla/ })
    const skara = page.getByRole('checkbox', { name: /^Skara SK/ })
    const lidkoping = page.getByRole('checkbox', { name: /^Lidköping SS/ })
    const klubblosa = page.getByRole('checkbox', { name: /^Klubblösa/ })

    await parent.check()
    await expect(skara).toBeChecked()
    await expect(lidkoping).toBeChecked()
    await expect(klubblosa).toBeChecked()

    await parent.uncheck()
    await expect(skara).not.toBeChecked()
    await expect(lidkoping).not.toBeChecked()
    await expect(klubblosa).not.toBeChecked()
  })

  test('share button opens dialog with QR and pre-populated URL', async ({ page }) => {
    await page.getByTestId('share-club-btn-Skara SK').click()

    const dialog = page.getByTestId('share-club-dialog')
    await expect(dialog).toBeVisible()

    // QR code is rendered as an svg
    await expect(dialog.locator('svg')).toBeVisible()

    const urlInput = page.getByTestId('share-club-url')
    const url = (await urlInput.inputValue()).trim()
    expect(url).toContain('share=view')
    expect(url).toContain('token=')
    expect(url).toMatch(/[?&]code=\d{6}/)
  })
})
