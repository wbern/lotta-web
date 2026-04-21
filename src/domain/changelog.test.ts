import { describe, expect, it } from 'vitest'
import {
  type ChangelogCommit,
  type ChangelogRelease,
  compareSemver,
  groupCommitsByType,
  releasesSince,
} from './changelog'

const commit = (overrides: Partial<ChangelogCommit>): ChangelogCommit => ({
  sha: 'abc1234',
  type: 'feat',
  scope: null,
  breaking: false,
  message: 'something',
  ...overrides,
})

const release = (overrides: Partial<ChangelogRelease>): ChangelogRelease => ({
  version: '1.0.0',
  date: '2026-04-20',
  commits: [],
  ...overrides,
})

describe('compareSemver', () => {
  it('orders by major, minor, patch', () => {
    expect(compareSemver('1.2.3', '1.2.4')).toBeLessThan(0)
    expect(compareSemver('1.3.0', '1.2.99')).toBeGreaterThan(0)
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
  })

  it('strips leading v', () => {
    expect(compareSemver('v1.0.0', '1.0.0')).toBe(0)
    expect(compareSemver('v2.0.0', 'v1.0.0')).toBeGreaterThan(0)
  })

  it('treats prereleases as lower than the release', () => {
    expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBeLessThan(0)
    expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0-rc.1', '1.0.0-rc.2')).toBeLessThan(0)
  })
})

describe('releasesSince', () => {
  it('returns releases with version higher than currentVersion', () => {
    const releases = [
      release({ version: '1.2.0' }),
      release({ version: '1.1.0' }),
      release({ version: '1.0.0' }),
    ]
    expect(releasesSince(releases, '1.1.0').map((r) => r.version)).toEqual(['1.2.0'])
  })

  it('always surfaces the unreleased bucket', () => {
    const releases = [release({ version: null, date: null }), release({ version: '1.0.0' })]
    expect(releasesSince(releases, '1.0.0').map((r) => r.version)).toEqual([null])
  })

  it('returns all releases when currentVersion is empty (e.g. untagged local build)', () => {
    const releases = [release({ version: '1.0.0' })]
    expect(releasesSince(releases, '')).toEqual(releases)
  })

  it('hides a prerelease of the current stable version', () => {
    // User is on v1.0.0; the v1.0.0-rc.1 that preceded it is older and must
    // not reappear in the "vad är nytt" list.
    const releases = [release({ version: '1.0.0-rc.1' })]
    expect(releasesSince(releases, '1.0.0')).toEqual([])
  })

  it('surfaces a newer prerelease to users on an older stable', () => {
    // Prereleases ship through rollback-deploy; a user on 1.0.0 should see
    // a freshly-cut 1.1.0-rc.1 as a new release.
    const releases = [release({ version: '1.1.0-rc.1' }), release({ version: '1.0.0' })]
    expect(releasesSince(releases, '1.0.0').map((r) => r.version)).toEqual(['1.1.0-rc.1'])
  })

  it('surfaces newer prereleases to a user currently on a prerelease', () => {
    const releases = [
      release({ version: '1.0.0' }),
      release({ version: '1.0.0-rc.2' }),
      release({ version: '1.0.0-rc.1' }),
    ]
    expect(releasesSince(releases, '1.0.0-rc.1').map((r) => r.version)).toEqual([
      '1.0.0',
      '1.0.0-rc.2',
    ])
  })
})

describe('groupCommitsByType', () => {
  it('groups by type in feat/fix/perf order', () => {
    const commits = [
      commit({ type: 'fix', message: 'f1' }),
      commit({ type: 'feat', message: 'n1' }),
      commit({ type: 'perf', message: 'p1' }),
      commit({ type: 'feat', message: 'n2' }),
    ]
    const groups = groupCommitsByType(commits)
    expect(groups.map((g) => g.type)).toEqual(['feat', 'fix', 'perf'])
    expect(groups[0].commits.map((c) => c.message)).toEqual(['n1', 'n2'])
    expect(groups[1].label).toBe('Buggfixar')
  })

  it('omits empty type groups', () => {
    const groups = groupCommitsByType([commit({ type: 'feat' })])
    expect(groups.map((g) => g.type)).toEqual(['feat'])
  })
})
