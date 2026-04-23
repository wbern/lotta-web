import type { BrowserContext } from '@playwright/test'
import {
  type ApiClient,
  apiClient,
  createTournament,
  ensureClubs,
  fetchStandings,
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
  { lastName: 'Fransson', firstName: 'David', ratingI: 1440, clubIndex: 0 },
  { lastName: 'Björk', firstName: 'Lena', ratingI: 1380, clubIndex: 0 },
  { lastName: 'Johansson', firstName: 'Erik', ratingI: 1850, clubIndex: 1 },
  { lastName: 'Nilsson', firstName: 'Karl', ratingI: 1720, clubIndex: 1 },
  { lastName: 'Pettersson', firstName: 'Lena', ratingI: 1600, clubIndex: 1 },
  { lastName: 'Karlsson', firstName: 'Oskar', ratingI: 1490, clubIndex: 1 },
  { lastName: 'Andersson', firstName: 'Maria', ratingI: 1410, clubIndex: 1 },
  { lastName: 'Holm', firstName: 'Tobias', ratingI: 1350, clubIndex: 1 },
]

const TOURNAMENT_NAME = 'GP Västra Götaland 2025'

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

async function enterPendingResults(page: Page, $: ApiClient, tid: number, roundNr: number) {
  const round = await $.get(`/api/tournaments/${tid}/rounds/${roundNr}`)
  for (const g of round.games) {
    if (!g.whitePlayer || !g.blackPlayer) continue
    if (g.resultType !== 'NO_RESULT') continue
    const result = g.boardNr % 2 === 1 ? 'Vit vinst' : 'Svart vinst'
    await enterResult(page, g.boardNr, result)
  }
}

async function pairNextRound(page: Page) {
  await page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' }).click()
  await page.getByRole('button', { name: 'Lotta nästa rond' }).click()
}

async function selectRound(page: Page, roundNr: number) {
  const roundSel = page.getByTestId('tournament-selector').locator('select').nth(2)
  await expect(roundSel.locator('option', { hasText: `Rond ${roundNr}` })).toBeAttached({
    timeout: 15_000,
  })
  await roundSel.selectOption({ label: `Rond ${roundNr}` })
}

async function undoViaMenu(page: Page) {
  await page.getByTestId('menu-bar').getByRole('button', { name: 'Redigera' }).click()
  await page.getByTestId('menu-dropdown').getByText('Ångra').click()
}

async function redoViaMenu(page: Page) {
  await page.getByTestId('menu-bar').getByRole('button', { name: 'Redigera' }).click()
  await page.getByTestId('menu-dropdown').getByText('Gör om').click()
}

async function withdrawPlayerViaUI(page: Page, playerName: string, fromRound: number) {
  await page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }).click()
  await page.getByRole('button', { name: 'Turneringsspelare', exact: true }).click()

  const dialog = page
    .locator('.dialog')
    .filter({ has: page.locator('.dialog-tab') })
    .first()
  await dialog.locator('.dialog-tab', { hasText: 'Turneringsspelare' }).click()
  await dialog.locator('tbody tr', { hasText: playerName }).click()
  await dialog.getByRole('button', { name: 'Editera', exact: true }).click()

  await page.getByTestId('withdrawn-checkbox').check()
  await page.getByTestId('withdrawn-round-input').fill(String(fromRound))
  await page.getByTestId('update-player').click()
  await dialog.getByRole('button', { name: 'Stäng' }).click()
}

async function goToPairings(page: Page) {
  await page.getByTestId('tab-headers').getByText('Lottning & resultat').click()
}

async function hostStartLive(
  page: Page,
): Promise<{ tid: number; viewUrl: string; skaraCode: string; $: ApiClient }> {
  await page.goto('/')
  await waitForApi(page)
  await dismissBanner(page)
  const $ = apiClient(page)
  const clubIds = await ensureClubs($, CLUBS)
  const players = PLAYERS.map((p) => ({ ...p, clubIndex: clubIds[p.clubIndex ?? 0] }))
  const { tid } = await createTournament(
    $,
    {
      name: TOURNAMENT_NAME,
      pairingSystem: 'Monrad',
      nrOfRounds: 7,
      selectedTiebreaks: ['Buchholz', 'Vinster'],
    },
    players,
  )
  await pairRound($, tid)
  await page.reload()
  await waitForApi(page)
  await dismissBanner(page)

  const sel = page.getByTestId('tournament-selector').locator('select').first()
  await sel.locator('option', { hasText: TOURNAMENT_NAME }).waitFor({ state: 'attached' })
  await sel.selectOption(TOURNAMENT_NAME)
  await expect(page.getByTestId('data-table')).toBeVisible()

  await page.getByTestId('tab-headers').getByText('Live (Beta)').click()
  await page.locator('button', { hasText: 'Starta Live' }).click()
  await expect(page.getByTestId('live-peer-badge')).toContainText('0 anslutna')

  await page.getByTestId('club-codes').getByRole('button', { name: 'Aktivera klubbfilter' }).click()
  const skaraCode = (await page.getByTestId('club-code-Skara SK').textContent())!.replace(/\s/g, '')
  const viewUrl = (await page.getByTestId('live-share-url').textContent())!.trim()

  return { tid, viewUrl, skaraCode, $ }
}

async function createRefereeGrant(page: Page): Promise<string> {
  await page.getByRole('tab', { name: 'Domarstyrning' }).click()
  await page.getByTestId('grant-label-input').fill('Domare')
  await page.getByTestId('grant-submit').click()
  const grantRow = page.locator('[data-testid^="grant-row-"]').first()
  await expect(grantRow).toBeVisible()
  const shareUrl = await grantRow.getAttribute('data-grant-url')
  expect(shareUrl).toBeTruthy()
  return shareUrl!
}

async function connectReferee(page: Page, shareUrl: string) {
  await page.addInitScript(() => {
    localStorage.setItem('lotta-live-name', 'Domare')
  })
  await page.goto(shareUrl)
  await expect(page.getByTestId('status-live')).toBeVisible({ timeout: 60_000 })
  await dismissBanner(page)

  const sel = page.getByTestId('tournament-selector').locator('select').first()
  await sel
    .locator('option', { hasText: TOURNAMENT_NAME })
    .waitFor({ state: 'attached', timeout: 30_000 })
  await sel.selectOption(TOURNAMENT_NAME)
}

async function connectSpectator(page: Page, viewUrl: string, clubCode: string) {
  await page.goto(viewUrl)
  await expect(page.getByTestId('status-live')).toBeVisible({ timeout: 60_000 })
  const dialog = page.getByTestId('club-code-dialog')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await dialog.locator('input').fill(clubCode)
  await page.getByTestId('club-code-submit').click()
  await expect(page.locator('.spectator-club-badge')).toContainText('Skara SK', {
    timeout: 30_000,
  })
}

async function waitForSpectatorRound(page: Page, roundNr: number) {
  await expect(page.locator('.spectator-round')).toContainText(`Rond ${roundNr}`, {
    timeout: 30_000,
  })
}

test.describe
  .serial('Tournament lifecycle — multi-round p2p sync', () => {
    test.setTimeout(90_000)

    let hostCtx: BrowserContext
    let hostPage: Page
    let refCtx: BrowserContext
    let refPage: Page
    let specCtx: BrowserContext
    let specPage: Page
    let tid: number
    let $: ApiClient

    test.beforeAll(async ({ browser }) => {
      hostCtx = await browser.newContext({ ignoreHTTPSErrors: true })
      hostPage = await hostCtx.newPage()
      refCtx = await browser.newContext({ ignoreHTTPSErrors: true })
      refPage = await refCtx.newPage()
      specCtx = await browser.newContext({ ignoreHTTPSErrors: true })
      specPage = await specCtx.newPage()
    })

    test.afterAll(async () => {
      await specPage.close()
      await specCtx.close()
      await refPage.close()
      await refCtx.close()
      await hostPage.close()
      await hostCtx.close()
    })

    test('setup: host starts live, referee + spectator connect', async () => {
      const started = await hostStartLive(hostPage)
      tid = started.tid
      $ = started.$
      const grantUrl = await createRefereeGrant(hostPage)

      await connectReferee(refPage, grantUrl)
      await connectSpectator(specPage, started.viewUrl, started.skaraCode)

      await goToPairings(hostPage)
      await expect(hostPage.getByTestId('data-table')).toBeVisible()
      await refPage.getByTestId('tab-headers').getByText('Lottning & resultat').click()
      await expect(refPage.getByTestId('data-table')).toBeVisible({ timeout: 30_000 })
      await expect(refPage.getByTestId('result-dropdown-1')).toBeVisible({ timeout: 30_000 })
    })

    test('round 1: referee reports, host undo/redo, sync verified', async () => {
      await enterResult(refPage, 1, 'Vit vinst')
      await expect(hostPage.getByTestId('result-dropdown-1')).toContainText('1-0', {
        timeout: 20_000,
      })
      await enterResult(refPage, 2, 'Svart vinst')
      await expect(hostPage.getByTestId('result-dropdown-2')).toContainText('0-1', {
        timeout: 20_000,
      })

      await undoViaMenu(hostPage)
      await undoViaMenu(hostPage)
      await expect
        .poll(async () => {
          const r = await $.get(`/api/tournaments/${tid}/rounds/1`)
          return r.games.filter((g: { resultType: string }) => g.resultType !== 'NO_RESULT').length
        })
        .toBe(0)

      await redoViaMenu(hostPage)
      await expect(refPage.getByTestId('result-dropdown-1')).toContainText('1-0', {
        timeout: 20_000,
      })

      await enterPendingResults(hostPage, $, tid, 1)
      await waitForSpectatorRound(specPage, 1)
    })

    test('round 2: withdrawal produces bye, results sync', async () => {
      await withdrawPlayerViaUI(hostPage, 'Tobias Holm', 2)
      await goToPairings(hostPage)
      await pairNextRound(hostPage)
      await selectRound(hostPage, 2)
      await enterPendingResults(hostPage, $, tid, 2)

      await selectRound(refPage, 2)
      await waitForSpectatorRound(specPage, 2)
    })

    test('round 3: another withdrawal, referee enters every result', async () => {
      await withdrawPlayerViaUI(hostPage, 'David Fransson', 3)
      await goToPairings(hostPage)
      await pairNextRound(hostPage)
      await selectRound(hostPage, 3)
      await selectRound(refPage, 3)

      const round3 = await $.get(`/api/tournaments/${tid}/rounds/3`)
      const playableR3 = round3.games.filter(
        (g: { whitePlayer: unknown; blackPlayer: unknown }) => g.whitePlayer && g.blackPlayer,
      )
      for (let i = 0; i < playableR3.length; i++) {
        await enterResult(refPage, playableR3[i].boardNr, i % 2 === 0 ? 'Vit vinst' : 'Svart vinst')
      }
      await expect
        .poll(async () => {
          const r = await $.get(`/api/tournaments/${tid}/rounds/3`)
          return r.games.filter(
            (g: { whitePlayer: unknown; blackPlayer: unknown; resultType: string }) =>
              g.whitePlayer && g.blackPlayer && g.resultType !== 'NO_RESULT',
          ).length
        })
        .toBe(playableR3.length)
      await waitForSpectatorRound(specPage, 3)
    })

    test('round 4: simultaneous entry by host and referee', async () => {
      await pairNextRound(hostPage)
      await selectRound(hostPage, 4)
      await selectRound(refPage, 4)

      const round4 = await $.get(`/api/tournaments/${tid}/rounds/4`)
      const playableR4 = round4.games.filter(
        (g: { whitePlayer: unknown; blackPlayer: unknown }) => g.whitePlayer && g.blackPlayer,
      )
      const half = Math.ceil(playableR4.length / 2)
      for (let i = 0; i < half; i++) {
        await enterResult(hostPage, playableR4[i].boardNr, 'Vit vinst')
      }
      for (let i = half; i < playableR4.length; i++) {
        await enterResult(refPage, playableR4[i].boardNr, 'Remi')
      }
      await expect
        .poll(async () => {
          const r = await $.get(`/api/tournaments/${tid}/rounds/4`)
          return r.games.filter(
            (g: { whitePlayer: unknown; blackPlayer: unknown; resultType: string }) =>
              g.whitePlayer && g.blackPlayer && g.resultType !== 'NO_RESULT',
          ).length
        })
        .toBe(playableR4.length)
      await waitForSpectatorRound(specPage, 4)
    })

    test('round 5: referee offline → host enters → reconnect via pull bootstrap', async () => {
      await pairNextRound(hostPage)
      await selectRound(hostPage, 5)
      await selectRound(refPage, 5)

      const round5 = await $.get(`/api/tournaments/${tid}/rounds/5`)
      const playableR5 = round5.games.filter(
        (g: { whitePlayer: unknown; blackPlayer: unknown }) => g.whitePlayer && g.blackPlayer,
      )

      await enterResult(hostPage, playableR5[0].boardNr, 'Vit vinst')
      await expect(refPage.getByTestId(`result-dropdown-${playableR5[0].boardNr}`)).toContainText(
        '1-0',
        { timeout: 20_000 },
      )

      await refCtx.setOffline(true)
      await expect(refPage.getByTestId('reconnecting-overlay')).toBeVisible({ timeout: 20_000 })

      for (let i = 1; i < playableR5.length; i++) {
        await enterResult(
          hostPage,
          playableR5[i].boardNr,
          i % 2 === 0 ? 'Vit vinst' : 'Svart vinst',
        )
      }

      await refCtx.setOffline(false)
      await expect(refPage.getByTestId('reconnecting-overlay')).not.toBeVisible({
        timeout: 45_000,
      })

      for (let i = 1; i < playableR5.length; i++) {
        const expected = i % 2 === 0 ? '1-0' : '0-1'
        await expect(refPage.getByTestId(`result-dropdown-${playableR5[i].boardNr}`)).toContainText(
          expected,
          { timeout: 30_000 },
        )
      }
      await waitForSpectatorRound(specPage, 5)
    })

    test('final: all 5 rounds fully resolved, standings present', async () => {
      const finalStandings = await fetchStandings($, tid, 5)
      expect(finalStandings.length).toBe(12)
      for (let r = 1; r <= 5; r++) {
        const round = await $.get(`/api/tournaments/${tid}/rounds/${r}`)
        for (const g of round.games) {
          if (g.whitePlayer && g.blackPlayer) {
            expect(g.resultType).not.toBe('NO_RESULT')
          }
        }
      }
    })
  })
