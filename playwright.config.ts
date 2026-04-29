import { defineConfig } from '@playwright/test'

const p2pPort = 5174
const p2pBaseURL = `https://localhost:${p2pPort}`

const hasBrowserStack = !!process.env.BROWSERSTACK_USERNAME
// P2P specs (Tier 2) need an MQTT broker, HTTPS, and a second dev server on
// p2pPort — none of which are present in CI. Opt in locally with RUN_P2P_E2E=1
// or implicitly via BrowserStack.
const runningP2P = process.env.RUN_P2P_E2E === '1' || hasBrowserStack
const runningStress = process.env.RUN_STRESS === '1'
// Investigation specs (curl-progression, publish-bug-repro, tourney-probe)
// load a real ~/Downloads/lotta-backup*.sqlite snapshot. Opt in locally with
// RUN_INVESTIGATION=1; otherwise excluded so CI doesn't fail without a backup.
const runningInvestigation = process.env.RUN_INVESTIGATION === '1'

const p2pWebRtcLaunch = {
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
    '--no-sandbox',
  ],
}
const p2pUse = {
  baseURL: p2pBaseURL,
  ignoreHTTPSErrors: true,
  launchOptions: p2pWebRtcLaunch,
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 4,

  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/report.json' }],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'on',
  },

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  webServer: [
    {
      command: 'pnpm dev',
      port: 5173,
      reuseExistingServer: true,
    },
    ...(runningP2P
      ? [
          {
            command: `./e2e/ensure-certs.sh && VITE_HTTPS=1 VITE_P2P_STRATEGY=mqtt pnpm dev --port ${p2pPort}`,
            url: p2pBaseURL,
            ignoreHTTPSErrors: true,
            reuseExistingServer: true,
          },
        ]
      : []),
  ],

  projects: [
    { name: 'add-group', testMatch: 'add-group.spec.ts' },
    { name: 'app', testMatch: 'app.spec.ts' },
    { name: 'dialogs', testMatch: 'dialogs.spec.ts' },
    { name: 'menus', testMatch: 'menus.spec.ts' },
    { name: 'navigation', testMatch: 'navigation.spec.ts' },
    { name: 'pairings', testMatch: 'pairings.spec.ts' },
    { name: 'standings', testMatch: 'standings.spec.ts' },
    { name: 'club-standings', testMatch: 'club-standings.spec.ts' },
    { name: 'chess4', testMatch: 'chess4.spec.ts' },
    { name: 'settings', testMatch: 'settings.spec.ts' },
    { name: 'tournament-lock', testMatch: 'tournament-lock.spec.ts' },
    { name: 'barred-pairing', testMatch: 'barred-pairing.spec.ts' },
    { name: 'edge-cases', testMatch: 'edge-cases.spec.ts' },
    { name: 'tiebreak-edge-cases', testMatch: 'tiebreak-edge-cases.spec.ts' },
    { name: 'pairing-edge-cases', testMatch: 'pairing-edge-cases.spec.ts' },
    { name: 'live', testMatch: 'live.spec.ts' },
    { name: 'undo', testMatch: 'undo.spec.ts' },
    { name: 'scroll', testMatch: 'scroll.spec.ts' },
    { name: 'fix-screenshots', testMatch: 'fix-screenshots.spec.ts' },
    { name: 'keybind-demo', testMatch: 'keybind-demo.spec.ts' },
    { name: 'whats-new', testMatch: 'whats-new.spec.ts' },
    { name: 'save-feedback-demo', testMatch: 'save-feedback-demo.spec.ts' },
    { name: 'em-setup', testMatch: 'em-setup.spec.ts' },
    { name: 'em-replay', testMatch: 'em-replay.spec.ts' },
    { name: 'em-chaos', testMatch: 'em-chaos.spec.ts' },
    ...(runningStress
      ? [{ name: 'determinism-stress', testMatch: 'determinism-stress.spec.ts' }]
      : []),
    { name: 'seed-corruption', testMatch: 'seed-corruption.spec.ts' },
    ...(runningInvestigation
      ? [
          { name: 'curl-progression', testMatch: 'curl-progression.spec.ts' },
          { name: 'publish-bug-repro', testMatch: 'publish-bug-repro.spec.ts' },
          { name: 'tourney-probe', testMatch: 'tourney-probe.spec.ts' },
        ]
      : []),
    { name: 'late-add-reshuffle', testMatch: 'late-add-reshuffle.spec.ts' },
    { name: 'late-add-bye-protection', testMatch: 'late-add-bye-protection.spec.ts' },
    {
      name: 'late-add-bye-protection-demo',
      testMatch: 'late-add-bye-protection-demo.spec.ts',
    },
    { name: 'offline-resilience', testMatch: 'offline-resilience.spec.ts' },
    {
      name: 'late-add-determinism-probe',
      testMatch: 'late-add-determinism-probe.spec.ts',
    },
    ...(runningP2P
      ? [
          { name: 'p2p', testMatch: 'p2p.spec.ts', use: p2pUse },
          { name: 'club-code', testMatch: 'club-code.spec.ts', use: p2pUse },
          { name: 'delning', testMatch: 'delning.spec.ts', use: p2pUse },
          { name: 'vydelning', testMatch: 'vydelning.spec.ts', use: p2pUse },
          { name: 'reconnection', testMatch: 'reconnection.spec.ts', use: p2pUse },
          {
            name: 'tournament-lifecycle',
            testMatch: 'tournament-lifecycle.spec.ts',
            use: p2pUse,
          },
          {
            name: 'compat-warnings',
            testMatch: 'compat-warnings.spec.ts',
            use: {
              baseURL: p2pBaseURL,
              ignoreHTTPSErrors: true,
              launchOptions: { args: ['--no-sandbox'] },
            },
          },
          { name: 'chaos', testMatch: 'chaos.spec.ts', use: p2pUse },
          { name: 'em-p2p-chaos', testMatch: 'em-p2p-chaos.spec.ts', use: p2pUse },
          {
            name: 'chaos-monkey',
            testMatch: 'chaos-monkey.spec.ts',
            use: {
              baseURL: p2pBaseURL,
              ignoreHTTPSErrors: true,
              launchOptions: { args: ['--no-sandbox'] },
            },
          },
        ]
      : []),
    ...(hasBrowserStack
      ? [
          {
            name: 'browserstack-p2p',
            testMatch: 'browserstack-p2p.spec.ts',
            use: {
              baseURL: p2pBaseURL,
              ignoreHTTPSErrors: true,
            },
          },
        ]
      : []),
  ],
})
