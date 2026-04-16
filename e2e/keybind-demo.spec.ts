import type { Page } from '@playwright/test'
import { apiClient, createTournament, type PlayerInput, waitForApi } from './api-helpers'
import { expect, test } from './fixtures'

// Eight players used across every demo — enough for four boards in round 1.
const PLAYERS: PlayerInput[] = [
  { lastName: 'Ödinson', firstName: 'Thor', ratingI: 2100 },
  { lastName: 'Läufeyson', firstName: 'Loki', ratingI: 1950 },
  { lastName: 'Järnsida', firstName: 'Björn', ratingI: 1800 },
  { lastName: 'Åskväder', firstName: 'Odin', ratingI: 1750 },
  { lastName: 'Stormöga', firstName: 'Frej', ratingI: 1600 },
  { lastName: 'Svärdhand', firstName: 'Tyr', ratingI: 1500 },
  { lastName: 'Stjärnljus', firstName: 'Freja', ratingI: 1400 },
  { lastName: 'Nattskärm', firstName: 'Sigrid', ratingI: 1300 },
]

async function setup(page: Page, opts: { name: string; pointsPerGame?: number; chess4?: boolean }) {
  await page.goto('/')
  await waitForApi(page)
  const $ = apiClient(page)
  const { tid } = await createTournament(
    $,
    {
      name: opts.name,
      pairingSystem: opts.chess4 ? 'Monrad' : 'Monrad',
      nrOfRounds: 3,
      pointsPerGame: opts.pointsPerGame,
      chess4: opts.chess4,
    },
    PLAYERS,
  )
  await $.post(`/api/tournaments/${tid}/pair?confirm=true`)
  await page.goto(`/?tournamentId=${tid}&tab=pairings`)
  await expect(page.getByTestId('data-table')).toBeVisible()
  return { rows: page.getByTestId('data-table').locator('tbody tr') }
}

async function pressAndVerify(page: Page, board: number, key: string, expected: string) {
  await page
    .getByTestId('data-table')
    .locator('tbody tr')
    .nth(board - 1)
    .click()
  await page.waitForTimeout(400)
  await page.keyboard.press(key)
  await expect(page.getByTestId(`result-dropdown-${board}`)).toContainText(expected)
  await page.waitForTimeout(500)
}

test.describe('Result keybind adaptation (lt-4aa)', () => {
  test('Standard 1-½-0: numeric 1 and 0, semantic R for draw', async ({ page }) => {
    await setup(page, { name: 'demo-standard' })

    // Board 1: press "1" → 1-0 (white win).
    await pressAndVerify(page, 1, '1', '1-0')
    // Board 2: press "0" → 0-1 (black win).
    await pressAndVerify(page, 2, '0', '0-1')
    // Board 3: press "r" → ½-½ (draw; no numeric key exists in 1-½-0).
    await pressAndVerify(page, 3, 'r', '½-½')

    // Open the context menu on board 4 to show the adaptive hint labels.
    await page.getByTestId('result-dropdown-4').click()
    await expect(page.getByTestId('shortcut-white-win')).toHaveText('V / 1')
    await expect(page.getByTestId('shortcut-draw')).toHaveText('R / Ö')
    await expect(page.getByTestId('shortcut-black-win')).toHaveText('F / 0')
    await page.waitForTimeout(1500)
  })

  test('Schackfyran 3-2-1: numeric 3, 2, 1 all work', async ({ page }) => {
    await setup(page, { name: 'demo-schack4', pointsPerGame: 4, chess4: true })

    // Board 1: press "3" → 3-1 (white win in Schack4an).
    await pressAndVerify(page, 1, '3', '3-1')
    // Board 2: press "2" → 2-2 (draw).
    await pressAndVerify(page, 2, '2', '2-2')
    // Board 3: press "1" → 1-3 (black win).
    await pressAndVerify(page, 3, '1', '1-3')

    // Open the context menu on board 4 to show the adaptive hint labels.
    await page.getByTestId('result-dropdown-4').click()
    await expect(page.getByTestId('shortcut-white-win')).toHaveText('V / 3')
    await expect(page.getByTestId('shortcut-draw')).toHaveText('R / Ö / 2')
    await expect(page.getByTestId('shortcut-black-win')).toHaveText('F / 1')
    await page.waitForTimeout(1500)
  })

  test('Skollags-DM 2-1-0: numeric 2, 1, 0 now work without toggling a setting', async ({
    page,
  }) => {
    // Skollags-DM = ppg=2, chess4=false. Before lt-4aa this required
    // enabling "Sätt maxpoäng per match omedelbart"; now it just works.
    await setup(page, { name: 'demo-skollags', pointsPerGame: 2 })

    // Board 1: press "2" → 2-0 (white win).
    await pressAndVerify(page, 1, '2', '2-0')
    // Board 2: press "1" → 1-1 (draw).
    await pressAndVerify(page, 2, '1', '1-1')
    // Board 3: press "0" → 0-2 (black win).
    await pressAndVerify(page, 3, '0', '0-2')

    // Open the context menu on board 4 to show the adaptive hint labels.
    await page.getByTestId('result-dropdown-4').click()
    await expect(page.getByTestId('shortcut-white-win')).toHaveText('V / 2')
    await expect(page.getByTestId('shortcut-draw')).toHaveText('R / Ö / 1')
    await expect(page.getByTestId('shortcut-black-win')).toHaveText('F / 0')
    await page.waitForTimeout(1500)
  })
})
