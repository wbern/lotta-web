/* eslint local/no-class-locators: "off" -- chaos inspects structural selectors */
/* eslint no-restricted-syntax: "off" -- chaos uses waitForTimeout to let UI settle between iterations */
/**
 * Chaos-monkey action catalog.
 *
 * Each action is a small UI-driven operation the runner can pick at random.
 * Actions MUST:
 *   - Probe the live DOM for preconditions before acting (skip gracefully
 *     when the app is in an incompatible state).
 *   - Close any stray menu/dialog they open, even on failure, so the next
 *     iteration starts from a clean state.
 *   - Never call `window.__lottaApi` — we are deliberately exercising the
 *     UI pipeline, not the API.
 *   - Return a human-readable outcome. Do NOT throw on precondition misses;
 *     throw ONLY on genuine bugs (e.g. click target missing when it should
 *     be present).
 */

import type { Page } from '@playwright/test'
import type { Rng } from './chaos-rng'

export type ActionStatus = 'ok' | 'skipped' | 'error'

export interface ActionOutcome {
  status: ActionStatus
  detail: string
}

export interface ActionContext {
  page: Page
  rng: Rng
}

export interface ChaosAction {
  name: string
  weight: number
  run: (ctx: ActionContext) => Promise<ActionOutcome>
}

// ── Small helpers ────────────────────────────────────────────────────────

const TAB_LABELS = [
  'Lottning & resultat',
  'Alfabetisk lottning',
  'Ställning',
  'Spelare',
  'Klubbställning',
  'Live (Beta)',
] as const

const MENU_BUTTONS = [
  'Turnering',
  'Redigera',
  'Lotta',
  'Ställning',
  'Spelare',
  'Inställningar',
  'Hjälp',
] as const

/**
 * Tidy up stray menus, dialogs, and banners. Runs before every action so each
 * action starts from a clean baseline regardless of what the previous action
 * left behind.
 *
 * Dialogs with `isDirty` ignore Escape, so we have to find and click a cancel
 * button. Try several rounds because one dialog may spawn another (e.g. an
 * alert after seed).
 */
export async function resetEphemera(page: Page): Promise<void> {
  for (let round = 0; round < 4; round++) {
    await page.keyboard.press('Escape').catch(() => {})
    const overlay = page.getByTestId('dialog-overlay')
    const visible = await overlay
      .first()
      .isVisible()
      .catch(() => false)
    if (!visible) break
    // Prefer cancel-style buttons (don't commit anything). "OK" comes last
    // because it may submit a settings dialog — acceptable, keeps chaos moving.
    const cancel = overlay
      .last()
      .getByRole('button', { name: /^(Avbryt|Stäng|Nej|Klar|OK)$/ })
      .first()
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click({ timeout: 1000 }).catch(() => {})
    } else {
      // Fallback: click the overlay backdrop (ignored for isDirty dialogs, but
      // cheap to try).
      await overlay
        .first()
        .click({ timeout: 500, position: { x: 5, y: 5 } })
        .catch(() => {})
    }
    await page.waitForTimeout(100)
  }
}

/** Accept the next `alert`/`confirm` dialog this page fires, once. */
function armDialogAccept(page: Page): void {
  page.once('dialog', (d) => {
    void d.accept().catch(() => {})
  })
}

async function hasTournament(page: Page): Promise<boolean> {
  const sel = page.getByTestId('tournament-selector').locator('select').first()
  const count = await sel
    .locator('option')
    .count()
    .catch(() => 0)
  // first option is placeholder ("Välj...")
  return count > 1 && (await sel.inputValue().catch(() => '')) !== ''
}

async function clickMenu(page: Page, name: (typeof MENU_BUTTONS)[number]): Promise<void> {
  await page.getByTestId('menu-bar').getByRole('button', { name, exact: true }).click()
}

// ── Actions ──────────────────────────────────────────────────────────────

export const switchTab: ChaosAction = {
  name: 'switchTab',
  weight: 6,
  async run({ page, rng }) {
    const headers = page.getByTestId('tab-headers')
    if (!(await headers.isVisible().catch(() => false))) {
      return { status: 'skipped', detail: 'tab headers not visible' }
    }
    const label = rng.pick([...TAB_LABELS])
    const btn = headers.getByText(label, { exact: true })
    if (!(await btn.isVisible().catch(() => false))) {
      return { status: 'skipped', detail: `tab "${label}" not present` }
    }
    await btn.click()
    return { status: 'ok', detail: `→ ${label}` }
  },
}

export const createRandomTournament: ChaosAction = {
  name: 'createRandomTournament',
  weight: 2,
  async run({ page }) {
    await clickMenu(page, 'Turnering')
    const ny = page.getByTestId('menu-dropdown').getByRole('button', { name: 'Ny', exact: true })
    await ny.click()
    const dialog = page.getByTestId('dialog-overlay').last()
    if (!(await dialog.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { status: 'skipped', detail: 'TournamentDialog did not open' }
    }
    await page.getByTestId('randomize-name').click()
    await page.getByTestId('randomize-group').click()
    const save = dialog.getByRole('button', { name: /^(Skapa|Spara)$/ })
    if (!(await save.isEnabled().catch(() => false))) {
      await page.keyboard.press('Escape')
      return { status: 'skipped', detail: 'save button disabled' }
    }
    await save.click()
    // wait for dialog to close
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    return { status: 'ok', detail: 'tournament created' }
  },
}

export const deleteCurrentTournament: ChaosAction = {
  name: 'deleteCurrentTournament',
  weight: 1,
  async run({ page }) {
    if (!(await hasTournament(page))) {
      return { status: 'skipped', detail: 'no tournament selected' }
    }
    await clickMenu(page, 'Turnering')
    const del = page
      .getByTestId('menu-dropdown')
      .getByRole('button', { name: 'Ta bort', exact: true })
    await del.click()
    const confirm = page.getByRole('button', { name: /^(Ta bort|OK|Ja)$/ }).last()
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
    return { status: 'ok', detail: 'delete confirmed' }
  },
}

export const seedPlayers: ChaosAction = {
  name: 'seedPlayers',
  weight: 3,
  async run({ page, rng }) {
    await clickMenu(page, 'Spelare')
    const seed = page
      .getByTestId('menu-dropdown')
      .getByRole('button', { name: 'Skapa testspelare', exact: true })
    await seed.click()
    const dialog = page.getByTestId('dialog-overlay').last()
    if (!(await dialog.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { status: 'skipped', detail: 'SeedPlayers dialog did not open' }
    }
    // Count input is the only number input at this time; update to small random
    const countInput = dialog.locator('input[type="number"]').first()
    const count = rng.int(4, 30)
    await countInput.fill(String(count))
    // Accept the trailing `alert` that seeding fires
    armDialogAccept(page)
    const create = dialog.getByRole('button', { name: 'Skapa', exact: true })
    if (!(await create.isEnabled().catch(() => false))) {
      await page.keyboard.press('Escape')
      return { status: 'skipped', detail: 'Skapa disabled' }
    }
    await create.click()
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
    return { status: 'ok', detail: `seeded ${count} players` }
  },
}

export const pairNextRound: ChaosAction = {
  name: 'pairNextRound',
  weight: 4,
  async run({ page }) {
    if (!(await hasTournament(page))) {
      return { status: 'skipped', detail: 'no tournament' }
    }
    await clickMenu(page, 'Lotta')
    const btn = page
      .getByTestId('menu-dropdown')
      .getByRole('button', { name: 'Lotta nästa rond', exact: true })
    if (!(await btn.isEnabled().catch(() => false))) {
      await page.keyboard.press('Escape')
      return { status: 'skipped', detail: 'pair button disabled' }
    }
    await btn.click()
    // If pairing errors, a "Kan inte lotta" dialog appears — dismiss it.
    const errTestId = page.getByTestId('pair-error')
    if (await errTestId.isVisible({ timeout: 3000 }).catch(() => false)) {
      const msg = (await errTestId.textContent().catch(() => '')) || ''
      await page
        .getByRole('button', { name: 'OK', exact: true })
        .click()
        .catch(() => {})
      return { status: 'ok', detail: `pair refused: ${msg.slice(0, 80)}` }
    }
    return { status: 'ok', detail: 'paired' }
  },
}

export const unpairLastRound: ChaosAction = {
  name: 'unpairLastRound',
  weight: 2,
  async run({ page }) {
    if (!(await hasTournament(page))) {
      return { status: 'skipped', detail: 'no tournament' }
    }
    await clickMenu(page, 'Lotta')
    const btn = page
      .getByTestId('menu-dropdown')
      .getByRole('button', { name: 'Ångra lottning', exact: true })
    if (!(await btn.isEnabled().catch(() => false))) {
      await page.keyboard.press('Escape')
      return { status: 'skipped', detail: 'unpair disabled' }
    }
    await btn.click()
    // ConfirmDialog appears — its primary button is labeled "OK"
    const dialog = page.getByTestId('dialog-overlay').last()
    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      const confirm = dialog.getByRole('button', { name: 'OK', exact: true })
      if (await confirm.isEnabled().catch(() => false)) {
        await confirm.click({ timeout: 2000 }).catch(() => {})
      }
      await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    }
    return { status: 'ok', detail: 'unpaired' }
  },
}

export const setRandomResult: ChaosAction = {
  name: 'setRandomResult',
  weight: 8,
  async run({ page, rng }) {
    const headers = page.getByTestId('tab-headers')
    const pairingsTab = headers.getByText('Lottning & resultat', { exact: true })
    if (await pairingsTab.isVisible().catch(() => false)) {
      await pairingsTab.click()
    }
    const rows = page.getByTestId('data-table').locator('tbody tr[data-board-nr]')
    const n = await rows.count().catch(() => 0)
    if (n === 0) return { status: 'skipped', detail: 'no games to score' }
    const idx = rng.int(0, n - 1)
    const row = rows.nth(idx)
    const boardNr = await row.getAttribute('data-board-nr').catch(() => null)
    if (!boardNr) return { status: 'skipped', detail: 'row missing board-nr' }
    const dropdown = page.getByTestId(`result-dropdown-${boardNr}`)
    if (!(await dropdown.isVisible().catch(() => false))) {
      return { status: 'skipped', detail: `dropdown for board ${boardNr} not visible` }
    }
    await dropdown.click()
    const menu = page.locator('.context-menu')
    if (!(await menu.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { status: 'skipped', detail: 'context menu did not open' }
    }
    // Top-level result buttons (skip the WO submenu to keep this first pass simple).
    // "Vit vinst" / "Svart vinst" also appear inside the Walk-Over submenu, so
    // .first() is required to target the top-level entry.
    const choices = ['Ej spelad', 'Vit vinst', 'Remi', 'Svart vinst']
    const pick = rng.pick(choices)
    const btn = menu.locator('button', { hasText: pick }).first()
    if (!(await btn.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape')
      return { status: 'skipped', detail: `result "${pick}" not in menu` }
    }
    await btn.click()
    return { status: 'ok', detail: `board ${boardNr} → ${pick}` }
  },
}

export const undo: ChaosAction = {
  name: 'undo',
  weight: 3,
  async run({ page }) {
    await clickMenu(page, 'Redigera')
    const btn = page
      .getByTestId('menu-dropdown')
      .getByRole('button', { name: /^Ångra/, exact: false })
      .first()
    const enabled = await btn.isEnabled().catch(() => false)
    if (!enabled) {
      await page.keyboard.press('Escape')
      return { status: 'skipped', detail: 'nothing to undo' }
    }
    await btn.click()
    return { status: 'ok', detail: 'undo' }
  },
}

export const redo: ChaosAction = {
  name: 'redo',
  weight: 2,
  async run({ page }) {
    await clickMenu(page, 'Redigera')
    const btn = page
      .getByTestId('menu-dropdown')
      .getByRole('button', { name: /^Gör om/, exact: false })
      .first()
    const enabled = await btn.isEnabled().catch(() => false)
    if (!enabled) {
      await page.keyboard.press('Escape')
      return { status: 'skipped', detail: 'nothing to redo' }
    }
    await btn.click()
    return { status: 'ok', detail: 'redo' }
  },
}

export const selectRandomTournament: ChaosAction = {
  name: 'selectRandomTournament',
  weight: 2,
  async run({ page, rng }) {
    const sel = page.getByTestId('tournament-selector').locator('select').first()
    const options = sel.locator('option')
    const count = await options.count().catch(() => 0)
    if (count <= 1) return { status: 'skipped', detail: 'no tournaments to pick from' }
    const idx = rng.int(1, count - 1) // skip placeholder
    const value = await options
      .nth(idx)
      .getAttribute('value')
      .catch(() => null)
    if (value == null || value === '') return { status: 'skipped', detail: 'invalid option' }
    await sel.selectOption(value)
    return { status: 'ok', detail: `selected tournament #${value}` }
  },
}

export const reloadPage: ChaosAction = {
  name: 'reloadPage',
  weight: 1,
  async run({ page }) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    // App ready once menu-bar renders
    await page.getByTestId('menu-bar').waitFor({ state: 'visible', timeout: 15_000 })
    return { status: 'ok', detail: 'reloaded' }
  },
}

export const openSettings: ChaosAction = {
  name: 'openSettings',
  weight: 1,
  async run({ page }) {
    await clickMenu(page, 'Inställningar')
    await page
      .getByTestId('menu-dropdown')
      .getByRole('button', { name: 'Inställningar', exact: true })
      .click()
    const dialog = page.getByTestId('dialog-overlay').last()
    if (!(await dialog.isVisible({ timeout: 2000 }).catch(() => false))) {
      return { status: 'skipped', detail: 'settings dialog did not open' }
    }
    // Toggle the first checkbox in the dialog, if present
    const checkbox = dialog.locator('input[type="checkbox"]').first()
    if (await checkbox.isVisible().catch(() => false)) {
      await checkbox.click({ timeout: 2000 }).catch(() => {})
    }
    // SettingsDialog uses "OK"/"Avbryt"; other dialogs use "Stäng"/"Klar"
    const close = dialog.getByRole('button', { name: /^(OK|Stäng|Klar|Spara|Avbryt)$/ }).first()
    await close.click({ timeout: 2000 })
    return { status: 'ok', detail: 'toggled a setting' }
  },
}

// ── Registry ─────────────────────────────────────────────────────────────

export const PHASE_A_ACTIONS: ChaosAction[] = [
  switchTab,
  createRandomTournament,
  seedPlayers,
  pairNextRound,
  unpairLastRound,
  setRandomResult,
  undo,
  redo,
  selectRandomTournament,
  reloadPage,
  openSettings,
  deleteCurrentTournament,
]

/** Weighted random action pick. */
export function pickAction(actions: ChaosAction[], rng: Rng): ChaosAction {
  const total = actions.reduce((s, a) => s + a.weight, 0)
  let roll = rng.float() * total
  for (const a of actions) {
    roll -= a.weight
    if (roll <= 0) return a
  }
  return actions[actions.length - 1]
}
