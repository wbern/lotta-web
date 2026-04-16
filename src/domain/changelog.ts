export type ChangelogType = 'feat' | 'fix' | 'perf'

export interface ChangelogEntry {
  sha: string
  date: string
  type: ChangelogType
  scope: string | null
  breaking: boolean
  message: string
}

interface ChangelogGroup {
  type: ChangelogType
  label: string
  entries: ChangelogEntry[]
}

const GROUP_LABELS: Record<ChangelogType, string> = {
  feat: 'Nyheter',
  fix: 'Buggfixar',
  perf: 'Förbättringar',
}

const GROUP_ORDER: ChangelogType[] = ['feat', 'fix', 'perf']

/**
 * Entries newer than the running build. `entries` must be in newest-first
 * order (as produced by `git log`); the SHA path relies on that ordering.
 * Falls back to a date cutoff when the running SHA isn't in the list (e.g.
 * rebased history); same-day commits are kept on the date path because
 * `git log` only gives us day granularity.
 */
export function entriesSince(
  entries: ChangelogEntry[],
  currentSha: string,
  currentDate: string,
): ChangelogEntry[] {
  if (entries.length === 0) return []
  if (currentSha) {
    const idx = entries.findIndex((e) => e.sha === currentSha)
    if (idx >= 0) return entries.slice(0, idx)
  }
  if (currentDate) {
    const cutoff = currentDate.slice(0, 10)
    return entries.filter((e) => e.date >= cutoff && e.sha !== currentSha)
  }
  return entries
}

/**
 * Groups entries by conventional-commit type in feat → fix → perf order.
 * Within each group the original (newest-first) ordering is preserved.
 */
export function groupByType(entries: ChangelogEntry[]): ChangelogGroup[] {
  const byType = new Map<ChangelogType, ChangelogEntry[]>()
  for (const entry of entries) {
    const bucket = byType.get(entry.type) ?? []
    bucket.push(entry)
    byType.set(entry.type, bucket)
  }
  return GROUP_ORDER.flatMap((type) => {
    const group = byType.get(type)
    return group && group.length > 0 ? [{ type, label: GROUP_LABELS[type], entries: group }] : []
  })
}

export function groupByDate(
  entries: ChangelogEntry[],
): { date: string; entries: ChangelogEntry[] }[] {
  const byDate = new Map<string, ChangelogEntry[]>()
  for (const entry of entries) {
    const bucket = byDate.get(entry.date) ?? []
    bucket.push(entry)
    byDate.set(entry.date, bucket)
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, entries: items }))
}

export async function fetchChangelog(baseUrl: string): Promise<ChangelogEntry[]> {
  try {
    const response = await fetch(`${baseUrl}changelog.json?t=${Date.now()}`)
    if (!response.ok) return []
    const data = (await response.json()) as ChangelogEntry[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}
