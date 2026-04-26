/**
 * Regression: TanStack Query v5's default `networkMode: 'online'` silently
 * pauses queries and mutations when `navigator.onLine === false`. Lotta is
 * IndexedDB + WebRTC, not HTTP — so the pause was both wrong and silent.
 * Asserts the global `'always'` default (src/query-client.ts) keeps the UI
 * working when DevTools "Offline" (== `context.setOffline(true)`) is on.
 */
import { expect, type Page, test } from './fixtures'

type LottaApi = {
  createTournament: (dto: unknown) => Promise<{ id: number }>
}

declare global {
  interface Window {
    __lottaApi: LottaApi
  }
}

const BASE_TOURNAMENT_DTO = {
  group: 'offline-test',
  pairingSystem: 'Monrad',
  initialPairing: 'Rating',
  nrOfRounds: 5,
  barredPairing: false,
  compensateWeakPlayerPP: false,
  pointsPerGame: 1,
  chess4: false,
  ratingChoice: 'ELO',
  showELO: true,
  showGroup: false,
}

async function waitForApi(page: Page) {
  await page.waitForFunction(() => window.__lottaApi != null, null, { timeout: 30_000 })
}

async function createTournamentAndReload(page: Page, name: string) {
  await page.evaluate(
    async ({ baseDto, n }) => {
      await window.__lottaApi.createTournament({ ...baseDto, name: n })
    },
    { baseDto: BASE_TOURNAMENT_DTO, n: name },
  )
  await page.reload()
  await waitForApi(page)
}

async function selectTournamentByName(page: Page, name: string) {
  const sel = page.getByTestId('tournament-selector').locator('select').first()
  await sel.locator('option', { hasText: name }).waitFor({ state: 'attached' })
  await sel.selectOption(name)
}

test.describe('offline resilience (networkMode: always)', () => {
  test('addPlayer mutation runs and the table updates while context is offline', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await waitForApi(page)
    const name = `Offline Add ${Date.now()}`
    await createTournamentAndReload(page, name)
    await selectTournamentByName(page, name)

    await page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }).click()
    await page
      .locator('.menu-dropdown')
      .getByRole('button', { name: 'Turneringsspelare', exact: true })
      .click()
    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    await context.setOffline(true)
    try {
      await dialog.getByRole('button', { name: 'Skapa eller editera spelare' }).click()
      await dialog
        .locator('.form-group')
        .filter({ hasText: 'Förnamn' })
        .locator('input')
        .fill('Offline')
      await dialog
        .locator('.form-group')
        .filter({ hasText: 'Efternamn' })
        .locator('input')
        .fill('Mutation')

      // Without the fix, `networkMode: 'online'` (the v5 default) would
      // silently pause this mutation; the click would appear to do nothing.
      await dialog.getByRole('button', { name: 'Lägg till', exact: true }).last().click()

      // On success, handleAdd switches to the 'tournament' tab and the new
      // player appears in the dialog's data-table — covers mutation + cache
      // invalidation + UI re-render in one assertion.
      const playersTable = dialog.getByTestId('data-table')
      await expect(playersTable.locator('tbody tr')).toContainText(['Offline Mutation'])
    } finally {
      await context.setOffline(false)
    }
  })

  test('useTournament query resolves under offline so the status bar updates', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await waitForApi(page)
    const name = `Offline Query ${Date.now()}`
    await createTournamentAndReload(page, name)

    await context.setOffline(true)
    try {
      // Selecting fires `useTournament(id)` — a React Query call against the
      // local IDB-backed API. Pre-fix, it would pause and the status bar
      // would never receive the new tournament.
      await selectTournamentByName(page, name)
      await expect(page.getByTestId('status-bar')).toContainText(name)
    } finally {
      await context.setOffline(false)
    }
  })
})
