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

async function hostStartLive(page: Page, tournamentName: string) {
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
}

test.describe('Club code entry via prompt', () => {
  test.setTimeout(120_000)

  test('spectator enters club code and sees filtered pairings', async ({ browser }) => {
    const hostCtx = await browser.newContext({ ignoreHTTPSErrors: true })
    const hostPage = await hostCtx.newPage()
    const viewerCtx = await browser.newContext({ ignoreHTTPSErrors: true })
    const viewerPage = await viewerCtx.newPage()

    try {
      await hostStartLive(hostPage, 'Kodtest-GP')

      // Enable club filter to generate codes.
      const codesSection = hostPage.getByTestId('club-codes')
      await expect(codesSection).toBeVisible()
      await codesSection.getByRole('button', { name: 'Aktivera klubbfilter' }).click()

      const skaraCode = hostPage.getByTestId('club-code-Skara SK')
      await expect(skaraCode).toBeVisible()
      const rawCode = (await skaraCode.textContent())!.replace(/\s/g, '')
      expect(rawCode).toMatch(/^\d+$/)

      const viewUrl = (await hostPage.getByTestId('live-share-url').textContent())!.trim()
      expect(viewUrl).toContain('share=view')

      await viewerPage.goto(viewUrl)
      await expect(viewerPage.getByTestId('status-live')).toBeVisible({ timeout: 60_000 })

      const codeDialog = viewerPage.getByTestId('club-code-dialog')
      await expect(codeDialog).toBeVisible({ timeout: 30_000 })
      await codeDialog.locator('input').fill(rawCode)
      await viewerPage.getByTestId('club-code-submit').click()

      await expect(viewerPage.locator('.spectator-club-badge')).toContainText('Skara SK', {
        timeout: 30_000,
      })
      const pairings = viewerPage.getByTestId('spectator-pairings')
      await expect(pairings).toBeVisible()
      // Skara SK players show full names.
      await expect(pairings).toContainText(/Lindberg|Svensson|Öberg|Eriksson/)
    } finally {
      await viewerPage.close()
      await viewerCtx.close()
      await hostPage.close()
      await hostCtx.close()
    }
  })
})
