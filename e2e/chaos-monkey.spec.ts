/* eslint no-restricted-syntax: "off" -- chaos uses waitForTimeout between retries */
/**
 * Chaos-monkey runner.
 *
 * Executes a seeded sequence of random UI actions against the real app,
 * watching for uncaught exceptions, console errors, or a wedged DB.
 * Each action goes through the UI (not __lottaApi) so this exercises the
 * full render + hook + repository pipeline.
 *
 * Flags (env vars):
 *   CHAOS_SEED        — integer seed; defaults to a clock-derived value
 *   CHAOS_ITERATIONS  — how many actions to attempt (default 100)
 *
 * Registered inside the `runningP2P` spread only so Tier-1 / CI ignores it.
 * Despite the p2p baseURL, this test doesn't need P2P — it just reuses the
 * HTTPS dev server so we don't have to spin up another webServer entry.
 */

import { type ActionOutcome, PHASE_A_ACTIONS, pickAction, resetEphemera } from './chaos-actions'
import { appendFinding } from './chaos-findings'
import { createRng } from './chaos-rng'
import { expect, test } from './fixtures'

const DEFAULT_ITERATIONS = 100

interface LogEntry {
  i: number
  action: string
  outcome: ActionOutcome
  ms: number
}

test.describe('Chaos monkey', () => {
  test.setTimeout(600_000)

  test('Phase A: random UI actions keep the app alive', async ({ page }) => {
    const seed = Number(process.env.CHAOS_SEED ?? Math.floor(Math.random() * 1e9))
    const iterations = Number(process.env.CHAOS_ITERATIONS ?? DEFAULT_ITERATIONS)
    const rng = createRng(seed)

    // eslint-disable-next-line no-console
    console.log(`[chaos-monkey] seed=${seed} iterations=${iterations}`)

    const pageErrors: Error[] = []
    const consoleErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err))
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // Ignore noisy benign errors (add patterns here as we discover them)
        if (text.includes('Download the React DevTools')) return
        consoleErrors.push(text)
      }
    })

    const log: LogEntry[] = []

    // ── Boot the app ───────────────────────────────────────────────────
    await page.goto('/')
    await page.getByTestId('menu-bar').waitFor({ state: 'visible', timeout: 30_000 })
    // Dismiss first-run banners
    await resetEphemera(page)

    const ACTION_BUDGET_MS = 15_000
    const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout ${ms}ms: ${label}`)), ms),
        ),
      ])

    const dumpOnFailure = async (reason: string): Promise<never> => {
      const tail = log.slice(-20)
      const banner = [
        `[chaos-monkey] FAILURE: ${reason}`,
        `[chaos-monkey] seed=${seed} iteration=${log.length}/${iterations}`,
        `[chaos-monkey] last ${tail.length} actions:`,
        ...tail.map(
          (e) => `  #${e.i} ${e.action} [${e.outcome.status}] ${e.outcome.detail} (${e.ms}ms)`,
        ),
        `[chaos-monkey] pageerrors: ${pageErrors.length}`,
        ...pageErrors.slice(-5).map((e) => `  ${e.message}`),
        `[chaos-monkey] console errors: ${consoleErrors.length}`,
        ...consoleErrors.slice(-5).map((s) => `  ${s}`),
        `(appended to e2e/chaos-findings.jsonl)`,
      ].join('\n')
      appendFinding({
        created: new Date().toISOString(),
        severity: 'auto-capture',
        status: 'auto',
        area: 'chaos-monkey',
        title: `chaos-monkey failure: ${reason.slice(0, 120)}`,
        detail: reason,
        test: 'chaos-monkey',
        seed,
        iteration: log.length,
        iterations_target: iterations,
        last_actions: tail,
        pageerrors: pageErrors.slice(-5).map((e) => ({ message: e.message, stack: e.stack })),
        console_errors: consoleErrors.slice(-5),
      })
      // eslint-disable-next-line no-console
      console.error(banner)
      throw new Error(banner)
    }

    // ── Main loop ──────────────────────────────────────────────────────
    for (let i = 1; i <= iterations; i++) {
      await resetEphemera(page)
      const action = pickAction(PHASE_A_ACTIONS, rng)
      const started = Date.now()
      let outcome: ActionOutcome
      try {
        outcome = await withTimeout(action.run({ page, rng }), ACTION_BUDGET_MS, action.name)
      } catch (err) {
        // Retry once after a forced cleanup — most timeouts are stale overlays
        // or pending menu state that a reset can shake loose.
        await resetEphemera(page).catch(() => {})
        await page.keyboard.press('Escape').catch(() => {})
        try {
          outcome = await withTimeout(action.run({ page, rng }), ACTION_BUDGET_MS, action.name)
          outcome = { ...outcome, detail: `(after retry) ${outcome.detail}` }
        } catch (err2) {
          outcome = { status: 'error', detail: `${err} | retry: ${err2}` }
        }
      }
      const entry: LogEntry = { i, action: action.name, outcome, ms: Date.now() - started }
      log.push(entry)

      // ── Invariants ─────────────────────────────────────────────────
      if (pageErrors.length > 0) {
        await dumpOnFailure(`pageerror: ${pageErrors[pageErrors.length - 1].message}`)
      }
      // Root element still attached
      const rootAttached = await page
        .evaluate(() => !!document.getElementById('root')?.firstChild)
        .catch(() => false)
      if (!rootAttached) {
        await dumpOnFailure('root element lost its React subtree')
      }
      // Menu bar still rendered (unless we're on a client/view route)
      const menuAttached = await page
        .getByTestId('menu-bar')
        .isVisible()
        .catch(() => false)
      if (!menuAttached) {
        // A page reload action in flight? Re-check after a tick.
        await page.waitForTimeout(200)
        const again = await page
          .getByTestId('menu-bar')
          .isVisible()
          .catch(() => false)
        if (!again) await dumpOnFailure('menu-bar vanished')
      }
    }

    // Summary
    const ok = log.filter((e) => e.outcome.status === 'ok').length
    const skipped = log.filter((e) => e.outcome.status === 'skipped').length
    const errored = log.filter((e) => e.outcome.status === 'error').length
    // eslint-disable-next-line no-console
    console.log(
      `[chaos-monkey] done: ok=${ok} skipped=${skipped} errored=${errored} (seed=${seed})`,
    )
    if (errored > 0 || consoleErrors.length > 0 || process.env.CHAOS_VERBOSE) {
      for (const e of log) {
        // eslint-disable-next-line no-console
        console.log(`  #${e.i} ${e.action} [${e.outcome.status}] ${e.outcome.detail}`)
      }
      for (const err of consoleErrors) {
        // eslint-disable-next-line no-console
        console.log(`  [console.error] ${err}`)
      }
    }
    expect(errored).toBe(0)
    expect(consoleErrors, `unexpected console errors; see log`).toHaveLength(0)
  })
})
