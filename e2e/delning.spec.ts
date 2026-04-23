import {
  apiClient,
  createTournament,
  ensureClubs,
  type PlayerInput,
  pairRound,
  waitForApi,
} from './api-helpers'
import { expect, type Page, test } from './fixtures'

const CLUBS = [{ name: 'Skara SK' }, { name: 'Lidköping SS' }]

const PLAYERS: PlayerInput[] = [
  { lastName: 'Eriksson', firstName: 'Anna', ratingI: 1900, clubIndex: 0 },
  { lastName: 'Lindberg', firstName: 'Magnus', ratingI: 1780, clubIndex: 0 },
  { lastName: 'Svensson', firstName: 'Karin', ratingI: 1650, clubIndex: 0 },
  { lastName: 'Öberg', firstName: 'Sofia', ratingI: 1520, clubIndex: 0 },
  { lastName: 'Johansson', firstName: 'Erik', ratingI: 1850, clubIndex: 1 },
  { lastName: 'Nilsson', firstName: 'Karl', ratingI: 1720, clubIndex: 1 },
  { lastName: 'Pettersson', firstName: 'Lena', ratingI: 1600, clubIndex: 1 },
  { lastName: 'Karlsson', firstName: 'Oskar', ratingI: 1490, clubIndex: 1 },
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

async function hostStartLiveWithClubCodes(
  page: Page,
  tournamentName: string,
): Promise<{ viewUrl: string; skaraCode: string }> {
  await page.goto('/')
  await waitForApi(page)
  await dismissBanner(page)
  const $ = apiClient(page)
  const clubIds = await ensureClubs($, CLUBS)
  const players = PLAYERS.map((p) => ({ ...p, clubIndex: clubIds[p.clubIndex ?? 0] }))
  const { tid } = await createTournament(
    $,
    { name: tournamentName, pairingSystem: 'Monrad', nrOfRounds: 3 },
    players,
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

  await page.getByTestId('club-codes').getByRole('button', { name: 'Aktivera klubbfilter' }).click()
  const skaraCode = (await page.getByTestId('club-code-Skara SK').textContent())!.replace(/\s/g, '')

  const viewUrl = (await page.getByTestId('live-share-url').textContent())!.trim()
  return { viewUrl, skaraCode }
}

async function enterClubCode(page: Page, code: string): Promise<void> {
  const dialog = page.getByTestId('club-code-dialog')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await dialog.locator('input').fill(code)
  await page.getByTestId('club-code-submit').click()
}

test.describe('Delning club-filtered spectator view', () => {
  test.setTimeout(180_000)

  test('club-scoped viewer: filtered pairings, name redaction, live result sync', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext({ ignoreHTTPSErrors: true })
    const hostPage = await hostCtx.newPage()
    const viewerCtx = await browser.newContext({ ignoreHTTPSErrors: true })
    const viewerPage = await viewerCtx.newPage()

    try {
      const { viewUrl, skaraCode } = await hostStartLiveWithClubCodes(hostPage, 'Klubb-GP 2025')

      await viewerPage.goto(viewUrl)
      await expect(viewerPage.getByTestId('status-live')).toBeVisible({ timeout: 60_000 })
      await enterClubCode(viewerPage, skaraCode)
      await expect(viewerPage.locator('.spectator-club-badge')).toContainText('Skara SK', {
        timeout: 30_000,
      })

      const pairings = viewerPage.getByTestId('spectator-pairings')
      await expect(pairings).toBeVisible()

      // Name redaction: opponent (Lidköping) shows only first name; Skara players show full names.
      const body = pairings.locator('tbody')
      await expect(body).toContainText(/Lindberg|Svensson|Öberg|Eriksson/)
      await expect(body).not.toContainText(/Johansson|Nilsson|Pettersson|Karlsson/)

      // Host enters board 1 result → viewer sees it through p2p push.
      await hostPage.getByTestId('tab-headers').getByText('Lottning & resultat').click()
      await expect(hostPage.getByTestId('data-table')).toBeVisible()
      await enterResult(hostPage, 1, 'Vit vinst')
      await expect(body).toContainText(/1\s*-\s*0|½-½|0-1/, { timeout: 20_000 })
    } finally {
      await viewerPage.close()
      await viewerCtx.close()
      await hostPage.close()
      await hostCtx.close()
    }
  })
})
