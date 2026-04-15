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
    await expect(page.locator('.live-tab-share-qr')).toBeVisible()
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

  test('shows Delning and Domarstyrning sub-tabs when hosting', async ({ page }) => {
    const delning = page.locator('[role="tab"]', { hasText: 'Delning' })
    const domarstyrning = page.locator('[role="tab"]', { hasText: 'Domarstyrning' })

    await expect(delning).toBeVisible()
    await expect(domarstyrning).toBeVisible()
    await expect(delning).toHaveAttribute('aria-selected', 'true')
  })

  test('switching to Domarstyrning sub-tab shows grants panel', async ({ page }) => {
    await page.locator('[role="tab"]', { hasText: 'Domarstyrning' }).click()

    await expect(page.locator('h4', { hasText: 'Domarstyrning' })).toBeVisible()
    await expect(page.getByTestId('live-tab-grants-panel')).toBeVisible()
  })

  test('switching between sub-tabs preserves hosting session', async ({ page }) => {
    // Go to Domarstyrning
    await page.locator('[role="tab"]', { hasText: 'Domarstyrning' }).click()
    await expect(page.locator('h4', { hasText: 'Domarstyrning' })).toBeVisible()

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
// 4. Per-club share dialog
// ===========================================================================
test.describe('Live per-club share', () => {
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

  test('share button opens dialog with QR and club code', async ({ page }) => {
    await page.locator('button', { hasText: 'Aktivera klubbfilter' }).click()

    await page.getByTestId('share-club-btn-Skara SK').click()

    const dialog = page.getByTestId('share-club-dialog')
    await expect(dialog).toBeVisible()

    // QR code is rendered as an svg
    await expect(dialog.locator('svg')).toBeVisible()

    const code = await page.getByTestId('share-club-dialog-code').textContent()
    expect(code?.trim()).toMatch(/^\d{4}$/)
  })
})
