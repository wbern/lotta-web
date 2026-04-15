import { defineConfig } from '@playwright/test'

const p2pPort = 5174
const p2pBaseURL = `https://localhost:${p2pPort}`

const hasBrowserStack = !!process.env.BROWSERSTACK_USERNAME
const runningP2P = process.env.RUN_P2P_E2E === '1' || hasBrowserStack

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
    { name: 'exports', testMatch: 'exports.spec.ts' },
    { name: 'results', testMatch: 'results.spec.ts' },
    { name: 'chess4', testMatch: 'chess4.spec.ts' },
    { name: 'settings', testMatch: 'settings.spec.ts' },
    { name: 'barred-pairing', testMatch: 'barred-pairing.spec.ts' },
    { name: 'edge-cases', testMatch: 'edge-cases.spec.ts' },
    { name: 'tiebreak-edge-cases', testMatch: 'tiebreak-edge-cases.spec.ts' },
    { name: 'import', testMatch: 'import.spec.ts' },
    { name: 'pairing-edge-cases', testMatch: 'pairing-edge-cases.spec.ts' },
    { name: 'error-cases', testMatch: 'error-cases.spec.ts' },
    { name: 'live', testMatch: 'live.spec.ts' },
    { name: 'undo', testMatch: 'undo.spec.ts' },
    { name: 'fix-screenshots', testMatch: 'fix-screenshots.spec.ts' },
    ...(runningP2P
      ? [
          {
            name: 'vydelning',
            testMatch: 'vydelning.spec.ts',
            use: {
              baseURL: p2pBaseURL,
              ignoreHTTPSErrors: true,
              launchOptions: {
                args: [
                  '--use-fake-ui-for-media-stream',
                  '--use-fake-device-for-media-stream',
                  '--disable-features=WebRtcHideLocalIpsWithMdns',
                  '--no-sandbox',
                ],
              },
            },
          },
          {
            name: 'club-code',
            testMatch: 'club-code.spec.ts',
            use: {
              baseURL: p2pBaseURL,
              ignoreHTTPSErrors: true,
              launchOptions: {
                args: [
                  '--use-fake-ui-for-media-stream',
                  '--use-fake-device-for-media-stream',
                  '--disable-features=WebRtcHideLocalIpsWithMdns',
                  '--no-sandbox',
                ],
              },
            },
          },
          {
            name: 'delning',
            testMatch: 'delning.spec.ts',
            use: {
              baseURL: p2pBaseURL,
              ignoreHTTPSErrors: true,
              launchOptions: {
                args: [
                  '--use-fake-ui-for-media-stream',
                  '--use-fake-device-for-media-stream',
                  '--disable-features=WebRtcHideLocalIpsWithMdns',
                  '--no-sandbox',
                ],
              },
            },
          },
          {
            name: 'p2p',
            testMatch: 'p2p.spec.ts',
            use: {
              baseURL: p2pBaseURL,
              ignoreHTTPSErrors: true,
              launchOptions: {
                args: [
                  '--use-fake-ui-for-media-stream',
                  '--use-fake-device-for-media-stream',
                  '--disable-features=WebRtcHideLocalIpsWithMdns',
                  '--no-sandbox',
                ],
              },
            },
          },
          {
            name: 'compat-warnings',
            testMatch: 'compat-warnings.spec.ts',
            use: {
              baseURL: p2pBaseURL,
              ignoreHTTPSErrors: true,
              launchOptions: {
                args: ['--no-sandbox'],
              },
            },
          },
          {
            name: 'reconnection',
            testMatch: 'reconnection.spec.ts',
            use: {
              baseURL: p2pBaseURL,
              ignoreHTTPSErrors: true,
              launchOptions: {
                args: [
                  '--use-fake-ui-for-media-stream',
                  '--use-fake-device-for-media-stream',
                  '--disable-features=WebRtcHideLocalIpsWithMdns',
                  '--no-sandbox',
                ],
              },
            },
          },
          {
            name: 'tournament-lifecycle',
            testMatch: 'tournament-lifecycle.spec.ts',
            use: {
              baseURL: p2pBaseURL,
              ignoreHTTPSErrors: true,
              launchOptions: {
                args: [
                  '--use-fake-ui-for-media-stream',
                  '--use-fake-device-for-media-stream',
                  '--disable-features=WebRtcHideLocalIpsWithMdns',
                  '--no-sandbox',
                ],
              },
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
