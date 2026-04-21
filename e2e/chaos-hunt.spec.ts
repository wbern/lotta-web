/* eslint local/no-class-locators: "off" -- structural traversal (.live-tab-*, .live-iframe, .live-page, .CP_Table) */
/**
 * Chaos hunt — sister to chaos.spec.ts.
 *
 * chaos.spec.ts is the convergence regression guard: narrow safe-set of
 * actions, must stay green, fails loudly on any divergence.
 *
 * chaos-hunt.spec.ts is the bug hunter: FULL PHASE_A action set (and
 * eventually Phase B), runs M seeds × N iters, and divergences are LOGGED
 * not failed. The only hard failures are genuine bugs — uncaught pageerror,
 * console.error on viewers, DB corruption, timeout.
 *
 * Invocation:
 *   RUN_P2P_E2E=1 HUNT_SEEDS=3 HUNT_ITERS=50 pnpm exec playwright test --project=chaos-hunt
 *
 * Env vars:
 *   HUNT_SEEDS        — number of sub-sessions to run in one invocation (default 1)
 *   HUNT_ITERS        — iterations per seed (default 30)
 *   HUNT_BASE_SEED    — base seed; each sub-session uses baseSeed + s (default: clock-derived)
 */

import type { FrameLocator, Page } from '@playwright/test'
import { apiClient, createTournament, type PlayerInput, pairRound, waitForApi } from './api-helpers'
import { type ActionOutcome, PHASE_A_ACTIONS, pickAction, resetEphemera } from './chaos-actions'
import { appendFinding } from './chaos-findings'
import { createRng } from './chaos-rng'
import { expect, test } from './fixtures'

const STRESS_PLAYERS: PlayerInput[] = [
  { lastName: 'Andersson', firstName: 'Magnus', ratingI: 2100 },
  { lastName: 'Carlsen', firstName: 'Nils', ratingI: 2050 },
  { lastName: 'Lindberg', firstName: 'Sara', ratingI: 1980 },
  { lastName: 'Nilsson', firstName: 'Oskar', ratingI: 1950 },
  { lastName: 'Pettersson', firstName: 'Eva', ratingI: 1900 },
  { lastName: 'Bergström', firstName: 'Johan', ratingI: 1870 },
  { lastName: 'Lundqvist', firstName: 'Elin', ratingI: 1820 },
  { lastName: 'Wikström', firstName: 'Henrik', ratingI: 1790 },
  { lastName: 'Holmberg', firstName: 'Maria', ratingI: 1750 },
  { lastName: 'Fransson', firstName: 'David', ratingI: 1720 },
  { lastName: 'Björk', firstName: 'Lena', ratingI: 1680 },
  { lastName: 'Ekström', firstName: 'Anton', ratingI: 1640 },
  { lastName: 'Sjöberg', firstName: 'Klara', ratingI: 1610 },
  { lastName: 'Nyström', firstName: 'Filip', ratingI: 1580 },
  { lastName: 'Sandberg', firstName: 'Ida', ratingI: 1550 },
  { lastName: 'Åberg', firstName: 'Tobias', ratingI: 1520 },
]

const DESKTOP_CLIENT_COUNT = 4
const MOBILE_CLIENT_COUNT = 4

interface ViewerPanel {
  id: string
  page: Page
  kind: 'desktop' | 'mobile'
}

interface ChaosLogEntry {
  i: number
  name: string
  outcome: ActionOutcome
  converged: boolean
  ms: number
}

interface PanelError {
  panel: string
  kind: 'pageerror' | 'console'
  message: string
  stack?: string
}

/**
 * Console-error patterns that are dev-environment / infra noise, not product
 * bugs. The public MQTT broker (`test.mosquitto.org`) flakes routinely and
 * would turn every hunt run red. Extend this list as new noise is observed —
 * but keep it tight: anything here is a blind spot for the hunt.
 */
const BENIGN_CONSOLE_PATTERNS: RegExp[] = [
  /Download the React DevTools/,
  /test\.mosquitto\.org/,
  /WebSocket connection to '[^']*mqtt[^']*' failed/,
]

/**
 * Attach pageerror + console.error listeners. Host AND every viewer gets one —
 * the viewers were the #1 coverage hole in the safe-set test, which only
 * listened on host.
 */
function attachErrorListeners(page: Page, panelId: string, sink: PanelError[]): void {
  page.on('pageerror', (err) => {
    sink.push({ panel: panelId, kind: 'pageerror', message: err.message, stack: err.stack })
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (BENIGN_CONSOLE_PATTERNS.some((re) => re.test(text))) return
    sink.push({ panel: panelId, kind: 'console', message: text })
  })
}

async function dismissBanner(page: Page): Promise<void> {
  try {
    const ok = page.getByRole('button', { name: 'OK', exact: true })
    await ok.click({ timeout: 1500 })
  } catch {
    // Banner not present
  }
}

async function snapshotHost(hostPage: Page): Promise<string> {
  const table = hostPage.getByTestId('data-table')
  if (!(await table.isVisible({ timeout: 1500 }).catch(() => false))) {
    return 'empty:no-table'
  }
  return table.evaluate((el) => {
    const rows = el.querySelectorAll('tbody tr[data-board-nr]')
    return Array.from(rows)
      .map((r) => {
        const cells = r.querySelectorAll('td')
        const board = cells[0]?.textContent?.trim() ?? ''
        const white = cells[1]?.textContent?.trim() ?? ''
        const resultBtn = r.querySelector('.result-dropdown')
        const result = (resultBtn?.textContent || '').replace(/▾/g, '').trim().replace(/\s+/g, ' ')
        const resultCell = r.querySelector('.result-cell')
        const black = resultCell?.nextElementSibling?.textContent?.trim() ?? ''
        return `${board}|${white}|${result}|${black}`
      })
      .join('\n')
  })
}

async function snapshotViewer(viewer: Page): Promise<string> {
  const frame: FrameLocator = viewer.frameLocator('.live-iframe')
  const table = frame.locator('table.CP_Table').first()
  const handle = await table.elementHandle({ timeout: 1500 }).catch(() => null)
  if (!handle) return 'empty:no-table'
  try {
    return await table.evaluate((el) => {
      const rows = el.querySelectorAll('tr.CP_Row')
      return Array.from(rows)
        .map((r) => {
          const cells = r.querySelectorAll('td')
          const board = cells[0]?.textContent?.trim() ?? ''
          const white = cells[1]?.textContent?.trim() ?? ''
          const result = cells[2]?.textContent?.trim().replace(/\s+/g, ' ') ?? ''
          const black = cells[3]?.textContent?.trim() ?? ''
          return `${board}|${white}|${result}|${black}`
        })
        .join('\n')
    })
  } finally {
    await handle.dispose().catch(() => {})
  }
}

async function awaitConvergence(
  hostPage: Page,
  viewer: Page,
  deadlineMs: number,
): Promise<{ converged: boolean; host: string; viewer: string }> {
  const start = Date.now()
  let host = ''
  let vs = ''
  while (Date.now() - start < deadlineMs) {
    host = await snapshotHost(hostPage).catch(() => 'error:snapshot-host')
    vs = await snapshotViewer(viewer).catch(() => 'error:snapshot-viewer')
    if (host === vs) return { converged: true, host, viewer: vs }
    await hostPage.waitForTimeout(300)
  }
  return { converged: false, host, viewer: vs }
}

test.describe('Chaos hunt — many devices, wide action set', () => {
  // Budget: 9-device setup (~60s) + M seeds × N iters (~3s/iter avg) + teardown.
  // 20 min covers 3 seeds × 50 iters comfortably.
  test.setTimeout(1_200_000)

  test('hunt mode: full PHASE_A, divergences logged not failed', async ({ browser }) => {
    const baseURL = 'https://localhost:5174'
    const seeds = Number(process.env.HUNT_SEEDS ?? 1)
    const iterations = Number(process.env.HUNT_ITERS ?? 30)
    const baseSeed = Number(process.env.HUNT_BASE_SEED ?? Date.now() % 1e9)

    // eslint-disable-next-line no-console
    console.log(`[chaos-hunt] seeds=${seeds} iters=${iterations} baseSeed=${baseSeed}`)

    for (let s = 0; s < seeds; s++) {
      const seed = baseSeed + s
      // eslint-disable-next-line no-console
      console.log(`[chaos-hunt] --- session ${s + 1}/${seeds} (seed=${seed}) ---`)
      await runHuntSession({ browser, baseURL, seed, iterations })
    }
  })
})

async function runHuntSession(opts: {
  browser: import('@playwright/test').Browser
  baseURL: string
  seed: number
  iterations: number
}): Promise<void> {
  const { browser, baseURL, seed, iterations } = opts
  const tournamentName = `Hunt-${seed}`

  const hostCtx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  })
  const hostPage = await hostCtx.newPage()
  const panelErrors: PanelError[] = []
  attachErrorListeners(hostPage, 'host', panelErrors)

  const viewers: ViewerPanel[] = []

  try {
    await hostPage.goto(`${baseURL}/`)
    await waitForApi(hostPage)
    await dismissBanner(hostPage)

    const $ = apiClient(hostPage)
    const { tid } = await createTournament(
      $,
      { name: tournamentName, pairingSystem: 'Monrad', nrOfRounds: 5 },
      STRESS_PLAYERS,
    )
    await pairRound($, tid)
    await hostPage.reload()
    await waitForApi(hostPage)
    await dismissBanner(hostPage)

    const sel = hostPage.getByTestId('tournament-selector').locator('select').first()
    await sel.locator('option', { hasText: tournamentName }).waitFor({ state: 'attached' })
    await sel.selectOption(tournamentName)
    await hostPage.waitForTimeout(400)

    // Start Live, derive kiosk viewer URL
    await hostPage.getByTestId('tab-headers').getByText('Live (Beta)').click()
    await expect(hostPage.locator('.live-tab-container')).toBeVisible()
    await hostPage.locator('button', { hasText: 'Starta Live' }).click()
    await expect(hostPage.locator('.live-tab-hosting')).toBeVisible()

    const urlEl = hostPage.locator('.live-tab-share-box .live-tab-url').first()
    await expect(urlEl).toBeVisible({ timeout: 10_000 })
    const rawUrl = (await urlEl.textContent())!.replace(/\s+/g, '')
    const roomMatch = rawUrl.match(/\/live\/([A-Z0-9]{6})/)
    expect(roomMatch).toBeTruthy()
    const roomCode = roomMatch![1]
    const shareUrl = `${baseURL}/live/${roomCode}`
    // eslint-disable-next-line no-console
    console.log(`[chaos-hunt] seed=${seed} viewer URL: ${shareUrl}`)

    await hostPage.getByTestId('tab-headers').getByText('Lottning & resultat').click()
    await expect(hostPage.getByTestId('data-table')).toBeVisible()

    // Build 4 desktop + 4 mobile viewers
    async function makeClient(mobile: boolean): Promise<Page> {
      const ctx = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: mobile ? { width: 390, height: 844 } : { width: 1024, height: 700 },
        ...(mobile
          ? {
              deviceScaleFactor: 3,
              isMobile: true,
              hasTouch: true,
              userAgent:
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            }
          : {}),
      })
      return ctx.newPage()
    }

    for (let i = 0; i < DESKTOP_CLIENT_COUNT; i++) {
      const panel: ViewerPanel = {
        id: `desk-${i}`,
        page: await makeClient(false),
        kind: 'desktop',
      }
      attachErrorListeners(panel.page, panel.id, panelErrors)
      viewers.push(panel)
    }
    for (let i = 0; i < MOBILE_CLIENT_COUNT; i++) {
      const panel: ViewerPanel = {
        id: `mob-${i}`,
        page: await makeClient(true),
        kind: 'mobile',
      }
      attachErrorListeners(panel.page, panel.id, panelErrors)
      viewers.push(panel)
    }

    // Connect all viewers
    async function connect(page: Page): Promise<void> {
      await page.goto(shareUrl)
      await expect(page.locator('.live-page')).toBeVisible({ timeout: 30_000 })
      await expect(page.locator('.live-iframe')).toBeVisible({ timeout: 90_000 })
    }
    // Stagger connections to mimic real-world pacing and avoid thundering-herd
    for (let i = 0; i < viewers.length; i += 2) {
      const pair = viewers.slice(i, i + 2)
      await Promise.all(pair.map((v) => connect(v.page)))
      await hostPage.waitForTimeout(200)
    }

    await hostPage.getByTestId('tab-headers').getByText('Live (Beta)').click()
    await expect(hostPage.locator('.live-tab-container')).toBeVisible()
    await expect(hostPage.locator('.live-tab-badge')).not.toContainText('0 anslutna', {
      timeout: 20_000,
    })
    await hostPage.getByTestId('tab-headers').getByText('Lottning & resultat').click()

    // ── Hunt loop ─────────────────────────────────────────────────────
    const rng = createRng(seed)
    const chaosLog: ChaosLogEntry[] = []
    const primaryViewer = viewers[0].page

    for (let i = 1; i <= iterations; i++) {
      await resetEphemera(hostPage).catch(() => {})
      const action = pickAction(PHASE_A_ACTIONS, rng) // FULL action set, not the narrowed safe-set
      const started = Date.now()
      let outcome: ActionOutcome
      try {
        outcome = await action.run({ page: hostPage, rng })
      } catch (err) {
        outcome = {
          status: 'error',
          detail: String(err instanceof Error ? err.message : err).slice(0, 120),
        }
      }
      await resetEphemera(hostPage).catch(() => {})

      const pairingsTab = hostPage
        .getByTestId('tab-headers')
        .getByText('Lottning & resultat', { exact: true })
      if (await pairingsTab.isVisible({ timeout: 1000 }).catch(() => false)) {
        await pairingsTab.click({ timeout: 2000 }).catch(() => {})
      }

      const conv = await awaitConvergence(hostPage, primaryViewer, 10_000)
      const entry: ChaosLogEntry = {
        i,
        name: action.name,
        outcome,
        converged: conv.converged,
        ms: Date.now() - started,
      }
      chaosLog.push(entry)

      if (!conv.converged) {
        // Hunt mode: log and continue. DO NOT throw.
        appendFinding({
          created: new Date().toISOString(),
          severity: 'auto-capture',
          status: 'auto',
          area: 'live/p2p',
          title: `hunt divergence at iter ${i} (seed ${seed}) after ${action.name}`,
          detail: `Hunt mode: convergence deadline 10s exceeded between host and primary desktop viewer. Logged and continued.`,
          test: 'chaos-hunt',
          seed,
          iteration: i,
          action: action.name,
          outcome,
          host_snapshot: conv.host,
          viewer_snapshot: conv.viewer,
          panel_errors: panelErrors.slice(-5),
          last_actions: chaosLog.slice(-10),
        })
      }

      // Hard failure: any pageerror or console.error across host + 8 viewers.
      // Viewer coverage was the #1 hole in the safe-set test.
      if (panelErrors.length > 0) {
        const last = panelErrors[panelErrors.length - 1]
        appendFinding({
          created: new Date().toISOString(),
          severity: 'auto-capture',
          status: 'auto',
          area: last.panel === 'host' ? 'host/uncaught' : `viewer/${last.kind}`,
          title: `hunt ${last.kind} on ${last.panel} at iter ${i}: ${last.message.slice(0, 120)}`,
          detail: `${last.kind} on ${last.panel} during hunt loop.`,
          test: 'chaos-hunt',
          seed,
          iteration: i,
          action: action.name,
          error_panel: last.panel,
          error_kind: last.kind,
          error_message: last.message,
          error_stack: last.stack,
          all_panel_errors: panelErrors,
          last_actions: chaosLog.slice(-10),
        })
        throw new Error(
          `[chaos-hunt] ${last.kind} on ${last.panel} at iter ${i} (seed ${seed}): ${last.message}\n(appended to e2e/chaos-findings.jsonl)`,
        )
      }
    }

    const okCount = chaosLog.filter((e) => e.outcome.status === 'ok').length
    const skippedCount = chaosLog.filter((e) => e.outcome.status === 'skipped').length
    const erroredCount = chaosLog.filter((e) => e.outcome.status === 'error').length
    const divergedCount = chaosLog.filter((e) => !e.converged).length
    // eslint-disable-next-line no-console
    console.log(
      `[chaos-hunt] seed=${seed} done: ok=${okCount} skipped=${skippedCount} errored=${erroredCount} diverged=${divergedCount}`,
    )

    // Action errors still count as hard failures — they indicate the action
    // harness itself broke, not a product bug the run is trying to surface.
    expect(erroredCount, `chaos actions errored; see log for seed ${seed}`).toBe(0)
  } finally {
    for (const v of viewers) {
      const ctx = v.page.context()
      await v.page.close().catch(() => {})
      await ctx.close().catch(() => {})
    }
    await hostPage.close().catch(() => {})
    await hostCtx.close().catch(() => {})
  }
}
