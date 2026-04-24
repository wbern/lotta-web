/**
 * Chaos hunt runner — standalone Node script, not a Playwright spec.
 *
 * Time-boxed by wall clock (HUNT_MINUTES) instead of test.setTimeout. Drives
 * the Playwright SDK directly; no fixtures, no test(). Replaces the old
 * e2e/chaos-hunt.spec.ts which was capped at 20 minutes by Playwright's
 * per-test timeout.
 *
 * Invocation:
 *   pnpm exec jiti e2e/chaos-hunt-runner.ts
 *
 * Prereq: the p2p dev server must already be running on https://localhost:5174:
 *   ./e2e/ensure-certs.sh && VITE_HTTPS=1 VITE_P2P_STRATEGY=mqtt pnpm dev --port 5174
 *
 * Env vars:
 *   HUNT_MINUTES         — wall-clock budget in minutes (default 5)
 *   HUNT_ITERS_PER_SEED  — max iterations per seed before rotating (default 50)
 *   HUNT_BASE_SEED       — starting seed; sessions use baseSeed + index (default: clock)
 *   HUNT_TRACE           — set to "1" to record Playwright traces per context
 */

import { request as httpsRequest } from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Browser, BrowserContext, FrameLocator, Page } from '@playwright/test'
import { chromium } from '@playwright/test'

import { apiClient, createTournament, type PlayerInput, pairRound, waitForApi } from './api-helpers'
import { type ActionOutcome, PHASE_A_ACTIONS, pickAction, resetEphemera } from './chaos-actions'
import { appendFinding } from './chaos-findings'
import { createRng } from './chaos-rng'

const BASE_URL = 'https://localhost:5174'
const HUNT_MINUTES = Number(process.env.HUNT_MINUTES ?? 5)
const HUNT_ITERS_PER_SEED = Number(process.env.HUNT_ITERS_PER_SEED ?? 50)
const HUNT_BASE_SEED = Number(process.env.HUNT_BASE_SEED ?? Date.now() % 1e9)
const HUNT_TRACE = process.env.HUNT_TRACE === '1'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIDEO_ROOT = path.join(__dirname, 'chaos-hunt-videos')
const TRACE_ROOT = path.join(__dirname, 'chaos-hunt-traces')

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
  context: BrowserContext
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

const BENIGN_CONSOLE_PATTERNS: RegExp[] = [
  /Download the React DevTools/,
  /test\.mosquitto\.org/,
  /WebSocket connection to '[^']*mqtt[^']*' failed/,
  /Trystero peer error: OperationError: User-Initiated Abort/,
  /falling back to ArrayBuffer instantiation/,
]

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

// Snapshot markers:
//   'skip:...'  — host state isn't comparable to viewer; awaitConvergence treats as converged
//   'empty:...' — host shows nothing; converges with any other 'empty:...' on the viewer
//   otherwise   — serialized table content, strict equality required
// URL schema mirrors src/components/layout/AppLayout.tsx (tab= / tournamentId= query params).
async function snapshotHost(hostPage: Page, liveTournamentId?: number): Promise<string> {
  const url = hostPage.url()
  const tabMatch = url.match(/[?&]tab=([^&]+)/)
  const tab = tabMatch ? decodeURIComponent(tabMatch[1]) : 'pairings'
  if (tab !== 'pairings') return 'skip:non-pairings-tab'
  const tidMatch = url.match(/[?&]tournamentId=(\d+)/)
  if (!tidMatch) return 'empty:no-tournament'
  if (liveTournamentId != null && Number(tidMatch[1]) !== liveTournamentId) {
    return 'skip:not-live-tournament'
  }

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

async function readHostRound(hostPage: Page): Promise<number | null> {
  const bar = hostPage.getByTestId('status-bar')
  const text = (await bar.textContent({ timeout: 1000 }).catch(() => '')) ?? ''
  const m = text.match(/Rond\s+(\d+)\/\d+/)
  return m ? Number(m[1]) : null
}

async function readViewerMaxRound(viewer: Page): Promise<number | null> {
  const options = viewer.locator('.live-round-select option')
  const count = await options.count().catch(() => 0)
  if (count > 0) {
    let max = 0
    for (let i = 0; i < count; i++) {
      const val = await options
        .nth(i)
        .getAttribute('value')
        .catch(() => null)
      const n = val ? Number(val) : NaN
      if (Number.isFinite(n) && n > max) max = n
    }
    return max > 0 ? max : null
  }

  const frame: FrameLocator = viewer.frameLocator('.live-iframe')
  const h2 = frame.locator('h2').first()
  const text = (await h2.textContent({ timeout: 1000 }).catch(() => '')) ?? ''
  const m = text.match(/rond\s+(\d+)/i)
  return m ? Number(m[1]) : null
}

async function awaitConvergence(
  hostPage: Page,
  viewer: Page,
  deadlineMs: number,
  liveTournamentId?: number,
): Promise<{ converged: boolean; host: string; viewer: string }> {
  const start = Date.now()
  let host = ''
  let vs = ''
  while (Date.now() - start < deadlineMs) {
    host = await snapshotHost(hostPage, liveTournamentId).catch(() => 'error:snapshot-host')
    vs = await snapshotViewer(viewer).catch(() => 'error:snapshot-viewer')
    if (host.startsWith('skip:')) return { converged: true, host, viewer: vs }
    if (host.startsWith('empty:') && vs.startsWith('empty:')) {
      return { converged: true, host, viewer: vs }
    }
    if (host === vs) return { converged: true, host, viewer: vs }
    await hostPage.waitForTimeout(300)
  }
  return { converged: false, host, viewer: vs }
}

function ensureServerUp(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = httpsRequest(
      `${BASE_URL}/`,
      { rejectUnauthorized: false, method: 'GET' },
      (res) => {
        res.resume()
        if (res.statusCode && res.statusCode < 500) resolve()
        else reject(new Error(`status ${res.statusCode}`))
      },
    )
    req.on('error', (err: NodeJS.ErrnoException) => {
      reject(new Error(err.code ?? err.message ?? String(err)))
    })
    req.setTimeout(3000, () => {
      req.destroy(new Error('timeout'))
    })
    req.end()
  })
}

interface SessionOpts {
  browser: Browser
  seed: number
  maxIters: number
  deadlineMs: number
  shouldStop: () => boolean
}

interface SessionResult {
  iterationsRun: number
  divergences: number
  autoCaptures: number
  hardFailure: boolean
}

async function runHuntSession(opts: SessionOpts): Promise<SessionResult> {
  const { browser, seed, maxIters, deadlineMs, shouldStop } = opts
  const tournamentName = `Hunt-${seed}`
  const videoDir = path.join(VIDEO_ROOT, String(seed))
  const traceDir = HUNT_TRACE ? path.join(TRACE_ROOT, String(seed)) : null

  const hostCtx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: videoDir },
  })
  if (traceDir) {
    await hostCtx.tracing.start({ screenshots: true, snapshots: true, sources: false })
  }
  const hostPage = await hostCtx.newPage()
  const panelErrors: PanelError[] = []
  attachErrorListeners(hostPage, 'host', panelErrors)

  const viewers: ViewerPanel[] = []
  const result: SessionResult = {
    iterationsRun: 0,
    divergences: 0,
    autoCaptures: 0,
    hardFailure: false,
  }

  try {
    await hostPage.goto(`${BASE_URL}/`)
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

    await hostPage.getByTestId('tab-headers').getByText('Live (Beta)').click()
    await hostPage.locator('.live-tab-container').waitFor({ state: 'visible' })
    await hostPage.locator('button', { hasText: 'Starta Live' }).click()
    await hostPage.locator('.live-tab-hosting').waitFor({ state: 'visible' })

    const urlEl = hostPage.locator('.live-tab-share-box .live-tab-url').first()
    await urlEl.waitFor({ state: 'visible', timeout: 10_000 })
    const rawUrl = (await urlEl.textContent())!.replace(/\s+/g, '')
    const roomMatch = rawUrl.match(/\/live\/([A-Z0-9]{6})/)
    if (!roomMatch) throw new Error(`could not parse room code from ${rawUrl}`)
    const roomCode = roomMatch[1]
    const shareUrl = `${BASE_URL}/live/${roomCode}`
    console.log(`[chaos-hunt] seed=${seed} viewer URL: ${shareUrl}`)

    await hostPage.getByTestId('tab-headers').getByText('Lottning & resultat').click()
    await hostPage.getByTestId('data-table').waitFor({ state: 'visible' })

    async function makeClient(mobile: boolean): Promise<{ page: Page; context: BrowserContext }> {
      const ctx = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: mobile ? { width: 390, height: 844 } : { width: 1024, height: 700 },
        recordVideo: { dir: videoDir },
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
      if (traceDir) {
        await ctx.tracing.start({ screenshots: true, snapshots: true, sources: false })
      }
      return { page: await ctx.newPage(), context: ctx }
    }

    for (let i = 0; i < DESKTOP_CLIENT_COUNT; i++) {
      const { page, context } = await makeClient(false)
      const panel: ViewerPanel = { id: `desk-${i}`, page, context, kind: 'desktop' }
      attachErrorListeners(panel.page, panel.id, panelErrors)
      viewers.push(panel)
    }
    for (let i = 0; i < MOBILE_CLIENT_COUNT; i++) {
      const { page, context } = await makeClient(true)
      const panel: ViewerPanel = { id: `mob-${i}`, page, context, kind: 'mobile' }
      attachErrorListeners(panel.page, panel.id, panelErrors)
      viewers.push(panel)
    }

    async function connect(page: Page): Promise<void> {
      await page.goto(shareUrl)
      await page.locator('.live-page').waitFor({ state: 'visible', timeout: 30_000 })
      await page.locator('.live-iframe').waitFor({ state: 'visible', timeout: 90_000 })
    }
    for (let i = 0; i < viewers.length; i += 2) {
      const pair = viewers.slice(i, i + 2)
      await Promise.all(pair.map((v) => connect(v.page)))
      await hostPage.waitForTimeout(200)
    }

    const expectedPeers = viewers.length
    await hostPage.getByTestId('tab-headers').getByText('Live (Beta)').click()
    await hostPage.locator('.live-tab-container').waitFor({ state: 'visible' })
    await hostPage
      .locator('.live-tab-badge')
      .filter({ hasText: `${expectedPeers} anslutna` })
      .waitFor({ state: 'visible', timeout: 30_000 })
    await hostPage.getByTestId('tab-headers').getByText('Lottning & resultat').click()

    const rng = createRng(seed)
    const chaosLog: ChaosLogEntry[] = []
    const primaryViewer = viewers[0].page

    for (let i = 1; i <= maxIters; i++) {
      if (shouldStop() || Date.now() >= deadlineMs) break

      await resetEphemera(hostPage).catch(() => {})
      const action = pickAction(PHASE_A_ACTIONS, rng)
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

      const conv = await awaitConvergence(hostPage, primaryViewer, 10_000, tid)
      const entry: ChaosLogEntry = {
        i,
        name: action.name,
        outcome,
        converged: conv.converged,
        ms: Date.now() - started,
      }
      chaosLog.push(entry)
      result.iterationsRun = i

      if (!conv.converged) {
        result.divergences++
        result.autoCaptures++
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

      const hostRound = await readHostRound(hostPage)
      if (hostRound != null) {
        const viewerRounds = await Promise.all(
          viewers.map(async (v) => ({
            id: v.id,
            round: await readViewerMaxRound(v.page),
          })),
        )
        const mismatched = viewerRounds.filter((v) => v.round !== hostRound)
        if (mismatched.length > 0) {
          result.autoCaptures++
          appendFinding({
            created: new Date().toISOString(),
            severity: 'auto-capture',
            status: 'auto',
            area: 'live/round-parity',
            title: `hunt round-parity mismatch at iter ${i} (seed ${seed}) after ${action.name}`,
            detail: `Host shows round ${hostRound}, but ${mismatched.length}/${viewers.length} viewers disagree. Logged and continued.`,
            test: 'chaos-hunt',
            seed,
            iteration: i,
            action: action.name,
            host_round: hostRound,
            viewer_rounds: viewerRounds,
            last_actions: chaosLog.slice(-10),
          })
        }
      }

      if (panelErrors.length > 0) {
        const last = panelErrors[panelErrors.length - 1]
        result.autoCaptures++
        result.hardFailure = true
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

    try {
      await hostPage.getByTestId('tab-headers').getByText('Live (Beta)').click({ timeout: 2000 })
      await hostPage.locator('.live-tab-container').waitFor({ state: 'visible', timeout: 5000 })
      const badgeText =
        (await hostPage.locator('.live-tab-badge').textContent({ timeout: 5000 })) ?? ''
      const m = badgeText.match(/(\d+)\s+anslutna/)
      const actualPeers = m ? Number(m[1]) : null
      if (actualPeers !== expectedPeers) {
        result.autoCaptures++
        appendFinding({
          created: new Date().toISOString(),
          severity: 'auto-capture',
          status: 'auto',
          area: 'live/peer-count',
          title: `hunt peer-count drop after seed ${seed}: badge reads "${badgeText.trim()}"`,
          detail: `Expected ${expectedPeers} connected viewers at end of hunt loop, badge reports ${actualPeers ?? 'unparseable'}. One or more viewers silently disconnected during chaos.`,
          test: 'chaos-hunt',
          seed,
          iteration: result.iterationsRun,
          expected_peers: expectedPeers,
          actual_peers: actualPeers,
          badge_text: badgeText.trim(),
          last_actions: chaosLog.slice(-10),
        })
      }
    } catch (err) {
      result.autoCaptures++
      appendFinding({
        created: new Date().toISOString(),
        severity: 'auto-capture',
        status: 'auto',
        area: 'live/peer-count',
        title: `hunt peer-count probe failed after seed ${seed}`,
        detail: `Could not read .live-tab-badge at end of session: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`,
        test: 'chaos-hunt',
        seed,
        iteration: result.iterationsRun,
      })
    }

    try {
      const roundtripResult = await hostPage.evaluate(
        async ({ tournamentName }) => {
          const api = (window as unknown as Record<string, any>).__lottaApi
          const hashBytes = async (bytes: Uint8Array): Promise<string> => {
            const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
            return Array.from(new Uint8Array(digest))
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('')
          }

          const before: Uint8Array = api.exportDbBytes()
          const beforeLen = before.byteLength
          const beforeHash = await hashBytes(before)

          await api.restoreDbBytes(before)

          const after: Uint8Array = api.exportDbBytes()
          const afterLen = after.byteLength
          const afterHash = await hashBytes(after)

          const tournaments: Array<{ name: string }> = await api.listTournaments()
          const hasTournament = tournaments.some((t) => t.name === tournamentName)

          return { beforeLen, beforeHash, afterLen, afterHash, hasTournament }
        },
        { tournamentName },
      )

      if (
        roundtripResult.beforeHash !== roundtripResult.afterHash ||
        !roundtripResult.hasTournament
      ) {
        result.autoCaptures++
        appendFinding({
          created: new Date().toISOString(),
          severity: 'auto-capture',
          status: 'auto',
          area: 'db/backup-roundtrip',
          title: `hunt backup/restore roundtrip mismatch after seed ${seed}`,
          detail: `Exported ${roundtripResult.beforeLen}B → restored → re-exported ${roundtripResult.afterLen}B. Hash match: ${roundtripResult.beforeHash === roundtripResult.afterHash}. Tournament "${tournamentName}" present after restore: ${roundtripResult.hasTournament}.`,
          test: 'chaos-hunt',
          seed,
          iteration: result.iterationsRun,
          roundtrip: roundtripResult,
        })
      }
    } catch (err) {
      result.autoCaptures++
      appendFinding({
        created: new Date().toISOString(),
        severity: 'auto-capture',
        status: 'auto',
        area: 'db/backup-roundtrip',
        title: `hunt backup/restore roundtrip threw after seed ${seed}`,
        detail: `Export or restore path raised: ${String(err instanceof Error ? err.message : err).slice(0, 300)}`,
        test: 'chaos-hunt',
        seed,
        iteration: result.iterationsRun,
      })
    }

    const okCount = chaosLog.filter((e) => e.outcome.status === 'ok').length
    const skippedCount = chaosLog.filter((e) => e.outcome.status === 'skipped').length
    const erroredCount = chaosLog.filter((e) => e.outcome.status === 'error').length
    const divergedCount = chaosLog.filter((e) => !e.converged).length
    console.log(
      `[chaos-hunt] seed=${seed} done: iters=${chaosLog.length} ok=${okCount} skipped=${skippedCount} errored=${erroredCount} diverged=${divergedCount}`,
    )
  } finally {
    for (const v of viewers) {
      if (traceDir) {
        await v.context.tracing.stop({ path: path.join(traceDir, `${v.id}.zip`) }).catch(() => {})
      }
      await v.page.close().catch(() => {})
      await v.context.close().catch(() => {})
    }
    if (traceDir) {
      await hostCtx.tracing.stop({ path: path.join(traceDir, 'host.zip') }).catch(() => {})
    }
    await hostPage.close().catch(() => {})
    await hostCtx.close().catch(() => {})
  }

  return result
}

async function main(): Promise<void> {
  console.log(
    `[chaos-hunt-runner] budget=${HUNT_MINUTES}min iters/seed=${HUNT_ITERS_PER_SEED} baseSeed=${HUNT_BASE_SEED} trace=${HUNT_TRACE}`,
  )

  try {
    await ensureServerUp()
  } catch (err) {
    console.error(`[chaos-hunt-runner] p2p dev server not reachable at ${BASE_URL}`)
    console.error(
      `  Start it with: ./e2e/ensure-certs.sh && VITE_HTTPS=1 VITE_P2P_STRATEGY=mqtt pnpm dev --port 5174`,
    )
    console.error(`  (Error: ${err instanceof Error ? err.message : err})`)
    process.exit(1)
  }

  const startedAt = Date.now()
  const deadlineMs = startedAt + HUNT_MINUTES * 60_000
  let interrupted = false
  const sigintHandler = (): void => {
    if (interrupted) {
      console.log('[chaos-hunt-runner] second SIGINT; exiting hard')
      process.exit(130)
    }
    interrupted = true
    console.log('[chaos-hunt-runner] SIGINT — finishing current seed to flush videos/findings')
  }
  process.on('SIGINT', sigintHandler)

  const browser = await chromium.launch()
  const totals = { seeds: 0, iters: 0, divergences: 0, autoCaptures: 0 }

  try {
    let seedIdx = 0
    while (Date.now() < deadlineMs && !interrupted) {
      const seed = HUNT_BASE_SEED + seedIdx
      const budgetLeftSec = Math.max(0, Math.round((deadlineMs - Date.now()) / 1000))
      console.log(
        `[chaos-hunt-runner] --- session ${seedIdx + 1} (seed=${seed}, budget_left=${budgetLeftSec}s) ---`,
      )
      const res = await runHuntSession({
        browser,
        seed,
        maxIters: HUNT_ITERS_PER_SEED,
        deadlineMs,
        shouldStop: () => interrupted,
      })
      totals.seeds++
      totals.iters += res.iterationsRun
      totals.divergences += res.divergences
      totals.autoCaptures += res.autoCaptures
      if (res.hardFailure) {
        console.error('[chaos-hunt-runner] hard failure surfaced; aborting remaining seeds')
        break
      }
      seedIdx++
    }
  } finally {
    await browser.close().catch(() => {})
    process.off('SIGINT', sigintHandler)
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
  console.log(
    `[chaos-hunt-runner] done: seeds=${totals.seeds} iters=${totals.iters} divergences=${totals.divergences} auto_captures=${totals.autoCaptures} elapsed=${elapsedSec}s`,
  )
}

main().catch((err) => {
  console.error('[chaos-hunt-runner] fatal:', err)
  process.exit(1)
})
