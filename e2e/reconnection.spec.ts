import { apiClient, createTournament, type PlayerInput, pairRound, waitForApi } from './api-helpers'
import { expect, type Page, test } from './fixtures'

const PLAYERS: PlayerInput[] = [
  { lastName: 'Eriksson', firstName: 'Anna', ratingI: 1800 },
  { lastName: 'Svensson', firstName: 'Erik', ratingI: 1750 },
  { lastName: 'Johansson', firstName: 'Karin', ratingI: 1700 },
  { lastName: 'Karlsson', firstName: 'Lars', ratingI: 1650 },
  { lastName: 'Nilsson', firstName: 'Maria', ratingI: 1600 },
  { lastName: 'Andersson', firstName: 'Sven', ratingI: 1550 },
  { lastName: 'Pettersson', firstName: 'Eva', ratingI: 1500 },
  { lastName: 'Olsson', firstName: 'Per', ratingI: 1450 },
]

async function dismissBanner(page: Page) {
  try {
    await page.getByRole('button', { name: 'OK', exact: true }).click({ timeout: 2000 })
  } catch {
    // Banner not present.
  }
}

async function enterResult(page: Page, boardNr: number, resultText: string) {
  const btn = page.getByTestId(`result-dropdown-${boardNr}`)
  await btn.scrollIntoViewIfNeeded()
  await btn.click()
  await page.locator('.context-menu').getByText(resultText).first().click()
}

async function hostStartLive(page: Page, tournamentName: string): Promise<string> {
  await page.goto('/')
  await waitForApi(page)
  await dismissBanner(page)
  const $ = apiClient(page)
  const { tid } = await createTournament(
    $,
    { name: tournamentName, pairingSystem: 'Monrad', nrOfRounds: 3 },
    PLAYERS,
  )
  await pairRound($, tid)

  await page.reload()
  await waitForApi(page)
  await dismissBanner(page)

  const sel = page.getByTestId('tournament-selector').locator('select').first()
  await sel.locator('option', { hasText: tournamentName }).waitFor({ state: 'attached' })
  await sel.selectOption(tournamentName)
  await expect(page.getByTestId('data-table')).toBeVisible()

  await page.getByTestId('tab-headers').getByText('Live (Beta)').click()
  await page.locator('button', { hasText: 'Starta Live' }).click()
  await expect(page.getByTestId('live-peer-badge')).toContainText('0 anslutna')

  const viewUrl = (await page.getByTestId('live-share-url').textContent())!.trim()
  expect(viewUrl).toBeTruthy()
  return viewUrl
}

async function connectClientAsViewer(page: Page, viewUrl: string): Promise<void> {
  await page.goto(viewUrl)
  await expect(page.getByTestId('status-live')).toBeVisible({ timeout: 60_000 })
  await expect(page).toHaveURL(/\/\?.*tab=pairings/)
  await dismissBanner(page)
}

test.describe('P2P reconnection', () => {
  test.setTimeout(180_000)

  test('client receives missed state after offline+reconnect (lt-zqe pull bootstrap)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext({ ignoreHTTPSErrors: true })
    const hostPage = await hostCtx.newPage()

    const clientCtx = await browser.newContext({ ignoreHTTPSErrors: true })
    const clientPage = await clientCtx.newPage()

    try {
      const viewUrl = await hostStartLive(hostPage, 'Reconnect-test')

      await connectClientAsViewer(clientPage, viewUrl)
      await expect(hostPage.getByTestId('live-peer-badge')).toContainText('1 anslutna', {
        timeout: 30_000,
      })

      // Host enters result on board 1 → client must see it via live push.
      await hostPage.getByTestId('tab-headers').getByText('Lottning & resultat').click()
      await expect(hostPage.getByTestId('data-table')).toBeVisible()
      // Wait for client's pairings to populate via p2p data provider before entering results.
      await expect(clientPage.getByTestId('spectator-result-1')).toBeVisible({ timeout: 30_000 })
      await enterResult(hostPage, 1, 'Vit vinst')
      await expect(clientPage.getByTestId('spectator-result-1')).toContainText('1-0', {
        timeout: 20_000,
      })

      // Client drops offline; reconnecting overlay appears.
      await clientCtx.setOffline(true)
      await expect(clientPage.getByTestId('reconnecting-overlay')).toBeVisible({ timeout: 20_000 })

      // Host enters more results and pairs round 2 while client is offline.
      // These updates will NOT reach the client via push — they must arrive
      // through the pages.getCurrent pull RPC on reconnect.
      await enterResult(hostPage, 2, 'Svart vinst')
      await enterResult(hostPage, 3, 'Remi')
      await enterResult(hostPage, 4, 'Vit vinst')

      // Client comes back online.
      await clientCtx.setOffline(false)
      await expect(clientPage.getByTestId('reconnecting-overlay')).not.toBeVisible({
        timeout: 45_000,
      })

      // The three results entered while offline must now be visible.
      await expect(clientPage.getByTestId('spectator-result-2')).toContainText('0-1', {
        timeout: 30_000,
      })
      await expect(clientPage.getByTestId('spectator-result-3')).toContainText('½-½', {
        timeout: 15_000,
      })
      await expect(clientPage.getByTestId('spectator-result-4')).toContainText('1-0', {
        timeout: 15_000,
      })
    } finally {
      await clientPage.close()
      await clientCtx.close()
      await hostPage.close()
      await hostCtx.close()
    }
  })
})
