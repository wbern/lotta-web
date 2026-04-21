// Build-time helpers that shape the release-grouped changelog.json. Pure so
// they can be unit-tested; vite.config.ts is the thin shell that reads git
// output and feeds it in.

import { type ChangelogCommit, type ChangelogRelease, compareSemver } from '../domain/changelog'

const CONVENTIONAL_COMMIT_REGEX = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/

const USER_FACING_TYPES: Record<string, true> = { feat: true, fix: true, perf: true }

export interface RawCommit {
  sha: string
  subject: string
}

export interface ReleaseTag {
  version: string
  date: string
  /** Commits contained in this release range (newest-first is fine). */
  shas: readonly string[]
}

/** Parse a conventional-commit subject into a structured commit, or null if unusable. */
export function parseCommit(raw: RawCommit): ChangelogCommit | null {
  const match = raw.subject.match(CONVENTIONAL_COMMIT_REGEX)
  if (!match) return null
  const [, type, scope, breaking, message] = match
  if (!USER_FACING_TYPES[type]) return null
  return {
    sha: raw.sha,
    type: type as ChangelogCommit['type'],
    scope: scope || null,
    breaking: !!breaking,
    message,
  }
}

/**
 * Group parsed commits into release buckets. `tags` should be in chronological
 * (oldest-first) order so the earliest containing tag claims each commit.
 * Commits not claimed by any tag go into a leading unreleased bucket.
 */
export function buildReleases(
  commits: readonly RawCommit[],
  tags: readonly ReleaseTag[],
): ChangelogRelease[] {
  const releaseBySha = new Map<string, { version: string; date: string }>()
  for (const tag of tags) {
    for (const sha of tag.shas) {
      if (!releaseBySha.has(sha)) {
        releaseBySha.set(sha, { version: tag.version, date: tag.date })
      }
    }
  }

  const releaseMap = new Map<string, ChangelogRelease>()
  const unreleased: ChangelogCommit[] = []
  for (const raw of commits) {
    const parsed = parseCommit(raw)
    if (!parsed) continue
    const rel = releaseBySha.get(parsed.sha)
    if (!rel) {
      unreleased.push(parsed)
      continue
    }
    let release = releaseMap.get(rel.version)
    if (!release) {
      release = { version: rel.version, date: rel.date, commits: [] }
      releaseMap.set(rel.version, release)
    }
    release.commits.push(parsed)
  }

  const sortedReleases = [...releaseMap.values()].sort((a, b) =>
    compareSemver(b.version as string, a.version as string),
  )
  return unreleased.length > 0
    ? [{ version: null, date: null, commits: unreleased }, ...sortedReleases]
    : sortedReleases
}
