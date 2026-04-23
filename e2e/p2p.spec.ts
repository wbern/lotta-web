import { apiClient, createTournament, type PlayerInput, pairRound, waitForApi } from './api-helpers'
import { expect, type Page, test } from './fixtures'

const PLAYERS: PlayerInput[] = [
  { lastName: 'Eriksson', firstName: 'Anna', ratingI: 1800 },
  { lastName: 'Svensson', firstName: 'Erik', ratingI: 1700 },
  { lastName: 'Johansson', firstName: 'Karin', ratingI: 1600 },
  { lastName: 'Karlsson', firstName: 'Lars', ratingI: 1500 },
]

async function hostStartLive(page: Page): Promise<string> {
  await page.goto('/')
  await waitForApi(page)
  const $ = apiClient(page)
  const { tid } = await createTournament(
    $,
    { name: 'P2P-test', pairingSystem: 'Monrad', nrOfRounds: 3 },
    PLAYERS,
  )
  await pairRound($, tid)

  await page.reload()
  await waitForApi(page)

  const tournamentSelect = page.getByTestId('tournament-selector').locator('select').first()
  await tournamentSelect.locator('option', { hasText: 'P2P-test' }).waitFor({ state: 'attached' })
  await tournamentSelect.selectOption('P2P-test')
  await expect(page.getByTestId('data-table')).toBeVisible()

  await page.getByTestId('tab-headers').getByText('Live (Beta)').click()
  await page.locator('button', { hasText: 'Starta Live' }).click()
  await expect(page.getByTestId('live-peer-badge')).toContainText('0 anslutna')

  const viewUrl = await page.getByTestId('live-share-url').textContent()
  expect(viewUrl).toBeTruthy()
  return viewUrl!.trim()
}

test.describe('P2P peer discovery', () => {
  test.setTimeout(90_000)

  test('viewer joins host via share URL and reaches the shared tournament', async ({
    page,
    browser,
  }) => {
    const viewUrl = await hostStartLive(page)

    const viewerContext = await browser.newContext({ ignoreHTTPSErrors: true })
    const viewerPage = await viewerContext.newPage()
    try {
      await viewerPage.goto(viewUrl)

      // Viewer first sees the SharedView connection screen, then — once p2p is
      // up — gets navigated into the main app with its data provider swapped
      // to read from the host. The `status-live` pill is the canonical signal
      // that the viewer is connected via p2p.
      await expect(viewerPage.getByTestId('shared-provider-ready')).toBeVisible()
      await expect(viewerPage.getByTestId('status-live')).toBeVisible({ timeout: 60_000 })
      await expect(viewerPage).toHaveURL(/\/\?.*tab=pairings/)
      await expect(viewerPage.getByTestId('status-bar')).toContainText('Ansluten till värd')

      // Host should see the viewer arrive.
      await expect(page.getByTestId('live-peer-badge')).toContainText('1 anslutna', {
        timeout: 30_000,
      })
    } finally {
      await viewerPage.close()
      await viewerContext.close()
    }
  })
})
