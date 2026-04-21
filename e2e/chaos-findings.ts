/**
 * Chaos findings log (append-only JSONL).
 *
 * Persistent list of issues surfaced by the chaos tests. Human-curated entries
 * are seeded manually; when a chaos test fails it also appends an auto-capture
 * entry here with seed / iteration / action trace / diagnostics so the next
 * run can see what the previous one found.
 *
 * File: e2e/chaos-findings.jsonl (tracked in git)
 *
 * Suggested curation loop:
 *   1. Run chaos tests; on failure, an `auto-capture` line is appended.
 *   2. Inspect diff: `git diff e2e/chaos-findings.jsonl`.
 *   3. Either promote to a curated finding (set id/severity/status/title) or
 *      drop the line if it's a dup of an existing one.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const thisDir = path.dirname(fileURLToPath(import.meta.url))
const FINDINGS_PATH = path.join(thisDir, 'chaos-findings.jsonl')

export interface ChaosFinding {
  created: string
  severity: 'bug' | 'sync-smell' | 'perf' | 'ux' | 'flaky' | 'auto-capture'
  status: 'open' | 'fixed' | 'wontfix' | 'investigating' | 'auto'
  area: string
  title: string
  detail: string
  // open-ended extras: seed, iteration, action, snapshots, pageerrors, last_actions, etc.
  [key: string]: unknown
}

export function appendFinding(entry: ChaosFinding): void {
  try {
    fs.appendFileSync(FINDINGS_PATH, `${JSON.stringify(entry)}\n`, 'utf8')
  } catch {
    // Logging must never take down a test
  }
}
