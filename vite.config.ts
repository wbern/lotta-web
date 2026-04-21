import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { defineConfig } from 'vitest/config'
import { buildReleases, type RawCommit, type ReleaseTag } from './src/build/changelog-build'
import { rollbackBuildConfig } from './src/build/rollback-config'
import type { ChangelogRelease } from './src/domain/changelog'

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

const commitHash = git('rev-parse --short HEAD')
const commitDate = git('log -1 --format=%ci')
const gitTag = git('describe --tags --abbrev=0')
const rollbackVersion = process.env.ROLLBACK_VERSION || null
const rollback = rollbackBuildConfig(rollbackVersion)

function generateVersionJson(): Plugin {
  const versionData = JSON.stringify({ hash: commitHash, date: commitDate, tag: gitTag })
  return {
    name: 'generate-version-json',
    buildStart() {
      // Write to public/ for dev mode
      writeFileSync(join(__dirname, 'public', 'version.json'), versionData)
    },
    writeBundle(options) {
      // Write to dist/ for production build
      const outDir = options.dir || join(__dirname, 'dist')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, 'version.json'), versionData)
    },
  }
}

function generateVersionsJsonStub(): Plugin {
  // Empty rollback-version list for dev and local builds; the real file is
  // regenerated from the live gh-pages branch at deploy time.
  const data = JSON.stringify({ versions: [] })
  return {
    name: 'generate-versions-json-stub',
    buildStart() {
      writeFileSync(join(__dirname, 'public', 'versions.json'), data)
    },
    writeBundle(options) {
      const outDir = options.dir || join(__dirname, 'dist')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, 'versions.json'), data)
    },
  }
}

function buildChangelog(): ChangelogRelease[] {
  // semantic-release emits plain vMAJOR.MINOR.PATCH (and optional prerelease
  // suffix); ignore anything else so we don't choke on stray legacy tags.
  const tagNames = git("tag --list 'v*' --sort=creatordate")
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => /^v\d+\.\d+\.\d+/.test(t))

  const tags: ReleaseTag[] = []
  let prevTag = ''
  for (const tag of tagNames) {
    const range = prevTag ? `${prevTag}..${tag}` : tag
    const shas = git(`log ${range} --format=%h`).split('\n').filter(Boolean)
    const date = git(`log -1 --format=%cI ${tag}`).slice(0, 10)
    tags.push({ version: tag.replace(/^v/, ''), date, shas })
    prevTag = tag
  }

  const raw = git('log --format=%h%x1f%s%x1e')
  if (!raw) return []
  const commits: RawCommit[] = raw
    .split('\x1e')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split('\x1f')
      return { sha, subject: subject ?? '' }
    })

  return buildReleases(commits, tags)
}

function generateChangelogJson(): Plugin {
  const data = JSON.stringify(buildChangelog())
  return {
    name: 'generate-changelog-json',
    buildStart() {
      writeFileSync(join(__dirname, 'public', 'changelog.json'), data)
    },
    writeBundle(options) {
      const outDir = options.dir || join(__dirname, 'dist')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, 'changelog.json'), data)
    },
  }
}

const certPath = join(__dirname, 'e2e', 'certs', 'cert.pem')
const keyPath = join(__dirname, 'e2e', 'certs', 'key.pem')
const useHttps = process.env.VITE_HTTPS === '1' && existsSync(certPath) && existsSync(keyPath)
const useMqtt = process.env.VITE_P2P_STRATEGY === 'mqtt'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_PATH || rollback?.base || '/',
  server: useHttps ? { https: { cert: readFileSync(certPath), key: readFileSync(keyPath) } } : {},
  resolve: {
    alias: {
      ...(useMqtt ? { trystero: '@trystero-p2p/mqtt' } : {}),
      // Rollback builds do not include VitePWA, so the virtual module it
      // normally provides does not exist. Point the import at an inert stub
      // so ReloadPrompt still compiles but never registers a service worker.
      ...(rollback
        ? { 'virtual:pwa-register/react': join(__dirname, 'src/build/pwa-register-stub.ts') }
        : {}),
    },
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __COMMIT_DATE__: JSON.stringify(commitDate),
    __GIT_TAG__: JSON.stringify(gitTag),
    __ROLLBACK_VERSION__: JSON.stringify(rollbackVersion),
  },
  plugins: [
    generateVersionJson(),
    generateVersionsJsonStub(),
    generateChangelogJson(),
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/sql.js/dist/sql-wasm-browser.wasm',
          dest: '',
          rename: { stripBase: true },
        },
      ],
    }),
    ...(rollback
      ? []
      : [
          VitePWA({
            registerType: 'prompt',
            workbox: {
              globPatterns: ['**/*.{js,css,html,wasm,woff2,png,svg,ico}'],
              globIgnores: ['version.json', 'changelog.json', 'versions.json'],
              maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
              // Runtime-cache older deployed versions under /v/<version>/ so
              // users can switch to a previous build and keep it available
              // offline. Cache name is stable across mainline releases so
              // pinned rollbacks survive new deploys.
              runtimeCaching: [
                {
                  urlPattern: ({ url }) => url.pathname.startsWith('/v/'),
                  handler: 'NetworkFirst',
                  options: {
                    cacheName: 'lotta-rollback-bundles',
                  },
                },
              ],
            },
            manifest: {
              name: 'Lotta - Schacklottning',
              short_name: 'Lotta',
              description: 'Hantera schackturneringar med lottning, ställning och publicering',
              lang: 'sv',
              start_url: '.',
              theme_color: '#0066cc',
              background_color: '#f0f0f0',
              display: 'standalone',
              icons: [
                { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
                { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                {
                  src: 'maskable-icon-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
          }),
        ]),
  ],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    setupFiles: ['src/test-setup.ts'],
  },
})
