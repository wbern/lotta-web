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

const TOURNAMENT_NAME = 'Lock Test 2026'
const TOURNAMENT_GROUP = 'A'

async function setupSeededTournament(page: Page) {
  await page.goto('/')
  await waitForApi(page)
  const $ = apiClient(page)
  const clubIds = await ensureClubs($, CLUBS)
  const players = PLAYERS.map((p) => ({ ...p, clubIndex: clubIds[p.clubIndex ?? 0] }))
  const { tid } = await createTournament(
    $,
    {
      name: TOURNAMENT_NAME,
      group: TOURNAMENT_GROUP,
      pairingSystem: 'Monrad',
      nrOfRounds: 5,
      selectedTiebreaks: ['Buchholz', 'Vinster'],
    },
    players,
  )
  await pairRound($, tid)
  await page.reload()
  await waitForApi(page)

  const sel = page.getByTestId('tournament-selector').locator('select').first()
  await sel.locator('option', { hasText: TOURNAMENT_NAME }).waitFor({ state: 'attached' })
  await sel.selectOption(TOURNAMENT_NAME)
  return tid
}

async function openEditTournament(page: Page) {
  await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
  await page.getByTestId('menu-dropdown').getByRole('button', { name: 'Editera' }).click()
  await expect(page.getByTestId('dialog-overlay')).toBeVisible()
}

async function openDeleteTournament(page: Page) {
  await page.getByTestId('menu-bar').getByRole('button', { name: 'Turnering' }).click()
  await page.getByTestId('menu-dropdown').getByRole('button', { name: 'Ta bort' }).click()
}

test.describe('Tournament settings lock — seeded tournament', () => {
  test('no-op Save round-trip on a seeded tournament closes without error', async ({ page }) => {
    await setupSeededTournament(page)
    await openEditTournament(page)

    const dialog = page.getByTestId('dialog-overlay')
    await dialog.getByRole('button', { name: 'Spara' }).click()

    // The save guard must not throw "Kan inte ändra ..." for unchanged values.
    await expect(page.getByTestId('tournament-save-error')).toHaveCount(0)
    await expect(dialog).not.toBeVisible()
  })

  test('locked fields are disabled in the settings dialog', async ({ page }) => {
    await setupSeededTournament(page)
    await openEditTournament(page)

    const dialog = page.getByTestId('dialog-overlay')
    await expect(dialog.getByTestId('tournament-pairing-system-select')).toBeDisabled()
    await expect(dialog.getByTestId('tournament-initial-pairing-select')).toBeDisabled()
    await expect(dialog.getByTestId('tournament-rating-choice-select')).toBeDisabled()
    await expect(dialog.getByTestId('tournament-barred-pairing-checkbox')).toBeDisabled()
    await expect(dialog.getByTestId('tournament-compensate-weak-checkbox')).toBeDisabled()
    await expect(dialog.getByTestId('tournament-point-system-select')).toBeDisabled()
  })

  test('delete on a seeded tournament requires typed name confirmation', async ({ page }) => {
    await setupSeededTournament(page)
    await openDeleteTournament(page)

    const dialog = page.getByTestId('dialog-overlay')
    const confirmInput = dialog.getByTestId('confirm-text-input')
    await expect(confirmInput).toBeVisible()

    const okBtn = dialog.getByRole('button', { name: 'OK', exact: true })
    await expect(okBtn).toBeDisabled()

    await confirmInput.fill('wrong name')
    await expect(okBtn).toBeDisabled()

    await confirmInput.fill(`${TOURNAMENT_NAME} ${TOURNAMENT_GROUP}`)
    await expect(okBtn).toBeEnabled()

    // Cancel — do not actually delete.
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).not.toBeVisible()
  })
})
