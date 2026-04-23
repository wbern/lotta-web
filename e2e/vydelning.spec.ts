import { apiClient, createTournament, type PlayerInput, pairRound, waitForApi } from './api-helpers'
import { expect, type Page, test } from './fixtures'

const PLAYERS: PlayerInput[] = [
  { lastName: 'Eriksson', firstName: 'Anna', ratingI: 1900 },
  { lastName: 'Svensson', firstName: 'Erik', ratingI: 1800 },
  { lastName: 'Johansson', firstName: 'Karin', ratingI: 1700 },
  { lastName: 'Karlsson', firstName: 'Lars', ratingI: 1600 },
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

  // Create a referee grant (default perms include reportResults + viewStandings).
  await page.getByRole('tab', { name: 'Domarstyrning' }).click()
  await page.getByTestId('grant-label-input').fill('Domare')
  await page.getByTestId('grant-submit').click()
  const grantRow = page.locator('[data-testid^="grant-row-"]').first()
  await expect(grantRow).toBeVisible()
  const shareUrl = await grantRow.getAttribute('data-grant-url')
  expect(shareUrl).toBeTruthy()
  expect(shareUrl).toContain('share=full')
  return shareUrl!
}

test.describe('Vydelning — referee grants', () => {
  test.setTimeout(180_000)

  test('host + referee sync results both directions', async ({ browser }) => {
    const hostCtx = await browser.newContext({ ignoreHTTPSErrors: true })
    const hostPage = await hostCtx.newPage()
    const refCtx = await browser.newContext({ ignoreHTTPSErrors: true })
    const refPage = await refCtx.newPage()

    try {
      const shareUrl = await hostStartLive(hostPage, 'Vydelning-test')

      // Full-share mode shows a name-entry screen before connecting.
      await refPage.addInitScript(() => {
        localStorage.setItem('lotta-live-name', 'Domare')
      })
      await refPage.goto(shareUrl)
      await expect(refPage.getByTestId('status-live')).toBeVisible({ timeout: 60_000 })
      await dismissBanner(refPage)

      // Full mode routes to main app — referee must pick the tournament.
      const refSel = refPage.getByTestId('tournament-selector').locator('select').first()
      await refSel.locator('option', { hasText: 'Vydelning-test' }).waitFor({
        state: 'attached',
        timeout: 30_000,
      })
      await refSel.selectOption('Vydelning-test')

      // Host and referee both view pairings.
      await hostPage.getByTestId('tab-headers').getByText('Lottning & resultat').click()
      await expect(hostPage.getByTestId('data-table')).toBeVisible()
      await refPage.getByTestId('tab-headers').getByText('Lottning & resultat').click()
      await expect(refPage.getByTestId('data-table')).toBeVisible({ timeout: 30_000 })
      await expect(refPage.getByTestId('result-dropdown-1')).toBeVisible({ timeout: 30_000 })

      // Host enters board 1 result → referee sees it via data-changed broadcast.
      await enterResult(hostPage, 1, 'Vit vinst')
      await expect(refPage.getByTestId('result-dropdown-1')).toContainText('1-0', {
        timeout: 20_000,
      })

      // Referee reports result on board 2 via commands.setResult RPC → host sees it.
      await enterResult(refPage, 2, 'Svart vinst')
      await expect(hostPage.getByTestId('result-dropdown-2')).toContainText('0-1', {
        timeout: 20_000,
      })
    } finally {
      await refPage.close()
      await refCtx.close()
      await hostPage.close()
      await hostCtx.close()
    }
  })
})
