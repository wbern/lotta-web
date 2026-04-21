import { describe, expect, it } from 'vitest'
import { buildReleases, parseCommit, type RawCommit, type ReleaseTag } from './changelog-build'

describe('parseCommit', () => {
  it('accepts user-facing types (feat/fix/perf)', () => {
    expect(parseCommit({ sha: 'a', subject: 'feat: new thing' })?.type).toBe('feat')
    expect(parseCommit({ sha: 'a', subject: 'fix: bug' })?.type).toBe('fix')
    expect(parseCommit({ sha: 'a', subject: 'perf: faster' })?.type).toBe('perf')
  })

  it('rejects non-user-facing types', () => {
    expect(parseCommit({ sha: 'a', subject: 'chore: bump deps' })).toBeNull()
    expect(parseCommit({ sha: 'a', subject: 'docs: update readme' })).toBeNull()
    expect(parseCommit({ sha: 'a', subject: 'ci: pin action' })).toBeNull()
    expect(parseCommit({ sha: 'a', subject: 'refactor: rename' })).toBeNull()
  })

  it('rejects subjects that do not match the conventional-commit shape', () => {
    expect(parseCommit({ sha: 'a', subject: 'no-colon here' })).toBeNull()
    expect(parseCommit({ sha: 'a', subject: '' })).toBeNull()
  })

  it('captures scope when present, null when absent', () => {
    expect(parseCommit({ sha: 'a', subject: 'feat(ui): button' })?.scope).toBe('ui')
    expect(parseCommit({ sha: 'a', subject: 'feat: button' })?.scope).toBeNull()
  })

  it('captures the breaking "!" marker', () => {
    expect(parseCommit({ sha: 'a', subject: 'feat!: drop API' })?.breaking).toBe(true)
    expect(parseCommit({ sha: 'a', subject: 'feat(api)!: drop API' })?.breaking).toBe(true)
    expect(parseCommit({ sha: 'a', subject: 'feat: non-breaking' })?.breaking).toBe(false)
  })

  it('preserves sha and message', () => {
    const parsed = parseCommit({ sha: 'deadbee', subject: 'fix(core): oops' })
    expect(parsed).toMatchObject({ sha: 'deadbee', message: 'oops' })
  })
})

describe('buildReleases', () => {
  const commit = (sha: string, subject: string): RawCommit => ({ sha, subject })

  it('returns an empty array when there are no commits', () => {
    expect(buildReleases([], [])).toEqual([])
  })

  it('drops non-user-facing commits silently', () => {
    const result = buildReleases(
      [commit('a', 'chore: bump'), commit('b', 'docs: readme')],
      [{ version: '1.0.0', date: '2026-04-20', shas: ['a', 'b'] }],
    )
    expect(result).toEqual([])
  })

  it('puts commits past the newest tag into the leading unreleased bucket', () => {
    const result = buildReleases(
      [commit('new', 'feat: fresh'), commit('old', 'fix: tagged')],
      [{ version: '1.0.0', date: '2026-04-20', shas: ['old'] }],
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      version: null,
      date: null,
      commits: [{ sha: 'new', type: 'feat', scope: null, breaking: false, message: 'fresh' }],
    })
    expect(result[1].version).toBe('1.0.0')
  })

  it('omits the unreleased bucket when every commit is claimed by a tag', () => {
    const result = buildReleases(
      [commit('a', 'feat: one')],
      [{ version: '1.0.0', date: '2026-04-20', shas: ['a'] }],
    )
    expect(result).toHaveLength(1)
    expect(result[0].version).toBe('1.0.0')
  })

  it('sorts releases newest-first by semver', () => {
    const tags: ReleaseTag[] = [
      { version: '1.0.0', date: '2026-04-20', shas: ['a'] },
      { version: '1.1.0', date: '2026-04-21', shas: ['b'] },
      { version: '2.0.0', date: '2026-04-22', shas: ['c'] },
    ]
    const result = buildReleases(
      [commit('c', 'feat: three'), commit('b', 'feat: two'), commit('a', 'feat: one')],
      tags,
    )
    expect(result.map((r) => r.version)).toEqual(['2.0.0', '1.1.0', '1.0.0'])
  })

  it('attributes each commit to the earliest containing tag', () => {
    // Tags listed oldest-first per the buildReleases contract. When the same
    // sha appears in multiple tag ranges (shouldn't happen in practice, but
    // guards against overlapping inputs), the earliest wins.
    const tags: ReleaseTag[] = [
      { version: '1.0.0', date: '2026-04-20', shas: ['a'] },
      { version: '1.1.0', date: '2026-04-21', shas: ['a', 'b'] },
    ]
    const result = buildReleases([commit('a', 'feat: one'), commit('b', 'feat: two')], tags)
    const v100 = result.find((r) => r.version === '1.0.0')
    const v110 = result.find((r) => r.version === '1.1.0')
    expect(v100?.commits.map((c) => c.sha)).toEqual(['a'])
    expect(v110?.commits.map((c) => c.sha)).toEqual(['b'])
  })

  it('orders prereleases below the matching stable', () => {
    const tags: ReleaseTag[] = [
      { version: '1.0.0-rc.1', date: '2026-04-18', shas: ['a'] },
      { version: '1.0.0', date: '2026-04-20', shas: ['b'] },
    ]
    const result = buildReleases([commit('b', 'feat: stable'), commit('a', 'feat: rc')], tags)
    expect(result.map((r) => r.version)).toEqual(['1.0.0', '1.0.0-rc.1'])
  })
})
