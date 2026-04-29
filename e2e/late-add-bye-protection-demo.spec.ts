/**
 * Visual showcase: a player is added mid-tournament, the
 * "Skydda från frirond i debutronden" checkbox is visible (and checked
 * by default), and the resulting R2 bye does NOT fall on the late-add.
 *
 * Setup is done via __lottaApi for brevity; the moments worth seeing —
 * opening the Spelare dialog, filling in the new player, watching the
 * protect checkbox, pairing R2 — happen through the real UI.
 *
 * Run with video:
 *   pnpm exec playwright test --project=late-add-bye-protection-demo
 *   pnpm exec playwright show-report
 */
import { expect, test } from './fixtures'
import { selectTournament } from './helpers'

type LottaApi = {
  createTournament: (dto: unknown) => Promise<{ id: number }>
  addTournamentPlayer: (tid: number, dto: unknown) => Promise<{ id: number }>
  pairNextRound: (tid: number) => Promise<{
    games: { boardNr: number; whitePlayer: { id: number } | null }[]
  }>
  setResult: (
    tid: number,
    roundNr: number,
    boardNr: number,
    req: { resultType: string },
  ) => Promise<unknown>
  listTournamentPlayers: (
    tid: number,
  ) => Promise<{ id: number; firstName: string; lastName: string }[]>
  getRound: (
    tid: number,
    roundNr: number,
  ) => Promise<{
    games: {
      whitePlayer: { id: number } | null
      blackPlayer: { id: number } | null
    }[]
  }>
}

declare global {
  interface Window {
    __lottaApi: LottaApi
  }
}

test.describe('Late-add bye protection (UI showcase)', () => {
  test.setTimeout(60_000)

  test('arbiter adds a late player and the bye lands on someone else', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__lottaApi != null, null, { timeout: 30_000 })

    // ----- Setup via API: 6 originals, R1 paired and resulted -----
    const tournamentId = await page.evaluate(async () => {
      const t = await window.__lottaApi.createTournament({
        name: 'Demo bye-protection',
        group: 'A',
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
      })
      const names = [
        ['Andersson', 'Erik'],
        ['Bengtsson', 'Bo'],
        ['Carlsson', 'Cecilia'],
        ['Davidsson', 'David'],
        ['Eriksson', 'Eva'],
        ['Fransson', 'Filip'],
      ]
      for (let i = 0; i < names.length; i++) {
        await window.__lottaApi.addTournamentPlayer(t.id, {
          firstName: names[i][1],
          lastName: names[i][0],
          ratingI: 2000 - i * 100,
          clubIndex: 0,
          federation: 'SWE',
          withdrawnFromRound: -1,
        })
      }
      const r1 = await window.__lottaApi.pairNextRound(t.id)
      for (const g of r1.games) {
        await window.__lottaApi.setResult(t.id, 1, g.boardNr, { resultType: 'WHITE_WIN' })
      }
      return t.id
    })

    await page.reload()
    await page.waitForFunction(() => window.__lottaApi != null, null, { timeout: 30_000 })
    await selectTournament(page, 'Demo bye-protection')

    // ----- UI: open Spelare → Turneringsspelare -----
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Spelare' }).click()
    await page
      .getByTestId('menu-dropdown')
      .getByRole('button', { name: 'Turneringsspelare', exact: true })
      .click()

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog).toBeVisible()

    // ----- Switch to the "Skapa eller editera spelare" tab and fill in the late arrival -----
    await dialog.locator('.dialog-tab', { hasText: 'Skapa eller editera spelare' }).click()
    await dialog.getByTestId('first-name-input').fill('Sent')
    await dialog.getByTestId('last-name-input').fill('Anlänt')

    // The protect-from-bye checkbox is visible, checked by default.
    const protectCheckbox = dialog.getByTestId('protect-from-bye-checkbox')
    await expect(protectCheckbox).toBeVisible()
    await expect(protectCheckbox).toBeChecked()

    // Linger so the showcase video has a beat where the checkbox is on screen.
    await page.waitForTimeout(800)

    await dialog.getByTestId('add-player').click()
    await dialog.getByRole('button', { name: 'Stäng' }).click()
    await expect(dialog).not.toBeVisible()

    // ----- UI: pair R2 -----
    await page.getByTestId('menu-bar').getByRole('button', { name: 'Lotta' }).click()
    await page.getByRole('button', { name: 'Lotta nästa rond' }).click()

    // Wait for the round selector to show R2 — confirms pairing landed.
    const roundSel = page.getByTestId('tournament-selector').locator('select').nth(2)
    await expect(roundSel.locator('option', { hasText: 'Rond 2' })).toBeAttached({
      timeout: 15_000,
    })

    // ----- Assert: the late-add did NOT receive the bye -----
    const { lateAddId, byePlayerId } = await page.evaluate(async (tid) => {
      const players = await window.__lottaApi.listTournamentPlayers(tid)
      const late = players.find((p) => p.firstName === 'Sent' && p.lastName === 'Anlänt')!
      const round = await window.__lottaApi.getRound(tid, 2)
      const byeGame = round.games.find((g) => !g.whitePlayer || !g.blackPlayer)
      const byeId = byeGame?.whitePlayer?.id ?? byeGame?.blackPlayer?.id ?? null
      return { lateAddId: late.id, byePlayerId: byeId }
    }, tournamentId)

    expect(byePlayerId, 'R2 must have a bye game').not.toBeNull()
    expect(byePlayerId, 'protected late-add must not be the R2 bye recipient').not.toBe(lateAddId)

    // Final pause so the showcase ends on a stable frame of the R2 pairings.
    await page.waitForTimeout(500)
  })
})
