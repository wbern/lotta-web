import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildVersionsJson } from './build-versions-json.mjs'

const scriptPath = fileURLToPath(new URL('./build-versions-json.mjs', import.meta.url))

describe('buildVersionsJson', () => {
  it('returns an empty list when no versions are present', () => {
    expect(buildVersionsJson([])).toEqual({ versions: [] })
  })

  it('emits each entry with version, date and hash', () => {
    expect(
      buildVersionsJson([
        { version: '1.2.4', date: '2026-03-25', hash: 'def5678' },
        { version: '1.2.3', date: '2026-03-10', hash: 'abc1234' },
      ]),
    ).toEqual({
      versions: [
        { version: '1.2.4', date: '2026-03-25', hash: 'def5678' },
        { version: '1.2.3', date: '2026-03-10', hash: 'abc1234' },
      ],
    })
  })

  it('sorts versions newest-first by date', () => {
    const result = buildVersionsJson([
      { version: '1.0.0', date: '2026-01-01', hash: 'aaa' },
      { version: '1.2.0', date: '2026-03-01', hash: 'ccc' },
      { version: '1.1.0', date: '2026-02-01', hash: 'bbb' },
    ])
    expect(result.versions.map((v) => v.version)).toEqual(['1.2.0', '1.1.0', '1.0.0'])
  })

  it('tolerates missing date or hash metadata', () => {
    expect(buildVersionsJson([{ version: '1.0.0' }])).toEqual({
      versions: [{ version: '1.0.0', date: null, hash: null }],
    })
  })
})

describe('build-versions-json CLI', () => {
  let work = ''

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'versions-json-'))
  })

  afterEach(() => {
    rmSync(work, { recursive: true, force: true })
  })

  function run(args) {
    execFileSync('node', [scriptPath, ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  }

  it('writes an empty manifest when the v/ directory is missing', () => {
    const out = join(work, 'versions.json')
    run(['--from-dir', work, '--out', out])
    expect(JSON.parse(readFileSync(out, 'utf-8'))).toEqual({ versions: [] })
  })

  it('lists every v/<name>/ subdirectory as a version entry', () => {
    mkdirSync(join(work, 'v', '1.0.0'), { recursive: true })
    mkdirSync(join(work, 'v', '1.1.0'), { recursive: true })
    writeFileSync(join(work, 'v', 'not-a-dir'), 'skipme')

    const out = join(work, 'versions.json')
    run(['--from-dir', work, '--out', out])
    const data = JSON.parse(readFileSync(out, 'utf-8'))
    const names = data.versions.map((v) => v.version).sort()
    expect(names).toEqual(['1.0.0', '1.1.0'])
    for (const entry of data.versions) {
      expect(entry.date).toBeNull()
      expect(entry.hash).toBeNull()
    }
  })

  it('exits with an error when required flags are missing', () => {
    expect(() =>
      execFileSync('node', [scriptPath, '--from-dir', work], {
        stdio: ['ignore', 'ignore', 'ignore'],
      }),
    ).toThrow()
  })
})
