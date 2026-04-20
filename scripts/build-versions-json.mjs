#!/usr/bin/env node
// Build a versions.json manifest describing available rollback bundles.
// Pure helper `buildVersionsJson` is unit-tested in the colocated .test.mjs.
//
// Usage:
//   node scripts/build-versions-json.mjs --from-dir <path-to-gh-pages-checkout> --out <file>
//
// Scans <path>/v/* for subdirectories (each is a deployed rollback version)
// and emits a versions.json listing them. If <path> is a git checkout, each
// version's most recent commit inside its v/<version>/ subtree is used for
// the date and hash metadata.

import { execFileSync } from 'node:child_process'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * @typedef {Object} VersionEntry
 * @property {string} version
 * @property {string} [date]
 * @property {string} [hash]
 */

/**
 * @param {VersionEntry[]} entries
 * @returns {{ versions: Array<{ version: string, date: string | null, hash: string | null }> }}
 */
export function buildVersionsJson(entries) {
  const normalized = entries.map((e) => ({
    version: e.version,
    date: e.date ?? null,
    hash: e.hash ?? null,
  }))
  normalized.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date)
    if (a.date) return -1
    if (b.date) return 1
    return 0
  })
  return { versions: normalized }
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function listVersionDirs(dir) {
  const vDir = join(dir, 'v')
  try {
    return readdirSync(vDir).filter((name) => {
      try {
        return statSync(join(vDir, name)).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

/**
 * @param {string} repoDir
 * @param {string} subpath
 * @returns {{ date?: string, hash?: string }}
 */
function readGitMetadata(repoDir, subpath) {
  try {
    const out = execFileSync(
      'git',
      ['-C', repoDir, 'log', '-1', '--format=%h%x1f%cI', '--', subpath],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    if (!out) return {}
    const [hash, iso] = out.split('\x1f')
    return { hash, date: iso.slice(0, 10) }
  } catch {
    return {}
  }
}

function parseArgs(argv) {
  const args = { fromDir: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from-dir') args.fromDir = argv[++i]
    else if (argv[i] === '--out') args.out = argv[++i]
  }
  return args
}

function main() {
  const { fromDir, out } = parseArgs(process.argv.slice(2))
  if (!fromDir || !out) {
    console.error('Usage: build-versions-json.mjs --from-dir <path> --out <file>')
    process.exit(2)
  }
  const names = listVersionDirs(fromDir)
  const entries = names.map((version) => ({
    version,
    ...readGitMetadata(fromDir, `v/${version}`),
  }))
  const json = buildVersionsJson(entries)
  writeFileSync(out, `${JSON.stringify(json, null, 2)}\n`)
  console.log(`Wrote ${out} (${json.versions.length} versions)`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
