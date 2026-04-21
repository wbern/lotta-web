/**
 * One-off curation driver. Invoked with `pnpm tsx e2e/chaos-curation-run.ts`
 * to triage the 16 hunt auto-captures currently in chaos-findings.jsonl
 * against the existing curated findings CM-001..CM-004. All 16 match
 * either CM-003 (host empty, viewer retains stale 8-row pairings) or
 * CM-004 (row-mismatch after undo/setRandomResult sequence).
 *
 * This file is kept in-tree as the audit artifact for the first curation
 * pass — see e2e/chaos-curation-log.jsonl for the emitted steps.
 */

import { logCurationStep } from './chaos-curation'

const agent = 'tj'

// Lines 5-6: host still has a populated table, but the viewer snapshot
// diverges on row-level results. Matches CM-004.
const cm004Dupes: Array<{ line: number; action: string; seed: number }> = [
  { line: 5, action: 'undo', seed: 42 },
  { line: 6, action: 'setRandomResult', seed: 42 },
]

// Lines 7-20: host_snapshot === 'empty:no-table' (no round on host) while
// the viewer iframe still paints the previous 8-row pairings table.
// Matches CM-003.
const cm003Dupes: Array<{ line: number; action: string; seed: number }> = [
  { line: 7, action: 'unpairLastRound', seed: 42 },
  { line: 8, action: 'switchTab', seed: 42 },
  { line: 9, action: 'setRandomResult', seed: 42 },
  { line: 10, action: 'setRandomResult', seed: 42 },
  { line: 11, action: 'createRandomTournament', seed: 100 },
  { line: 12, action: 'pairNextRound', seed: 100 },
  { line: 13, action: 'setRandomResult', seed: 100 },
  { line: 14, action: 'selectRandomTournament', seed: 100 },
  { line: 15, action: 'setRandomResult', seed: 100 },
  { line: 16, action: 'switchTab', seed: 100 },
  { line: 17, action: 'seedPlayers', seed: 100 },
  { line: 18, action: 'setRandomResult', seed: 100 },
  { line: 19, action: 'createRandomTournament', seed: 100 },
  { line: 20, action: 'switchTab', seed: 100 },
]

for (const row of cm004Dupes) {
  logCurationStep({
    agent,
    action: 'dedupe',
    dup_of: 'CM-004',
    source_line: row.line,
    reason: `Auto-capture from hunt seed=${row.seed} on action=${row.action}. Host retains populated pairings table; viewer snapshot diverges on row-level result/opponent data. Matches CM-004 signature (undo or setRandomResult from non-pairings context not re-broadcasting to viewer iframe).`,
  })
}

for (const row of cm003Dupes) {
  logCurationStep({
    agent,
    action: 'dedupe',
    dup_of: 'CM-003',
    source_line: row.line,
    reason: `Auto-capture from hunt seed=${row.seed} on action=${row.action}. Host snapshot = 'empty:no-table' (no active round) but viewer iframe still renders the prior 8-row pairings table. Matches CM-003 signature (viewer retains stale pairings after host drops its round — unpair/deleteTournament/createRandomTournament all trigger the same failure mode).`,
  })
}

console.log(`Logged ${cm004Dupes.length + cm003Dupes.length} curation steps.`)
