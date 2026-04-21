import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  project: ['src/**/*.{ts,tsx}'],
  ignore: [
    'src/globals.d.ts',
    // Referenced only via a Vite alias string in vite.config.ts (for rollback
    // builds), so knip's static import graph cannot see the usage.
    'src/build/pwa-register-stub.ts',
  ],
  ignoreDependencies: [
    '@commitlint/cli',
    '@secretlint/core',
    '@secretlint/secretlint-rule-preset-recommend',
    // semantic-release plugins: referenced only from .releaserc.json,
    // which knip's built-in plugin does not fully resolve.
    '@semantic-release/commit-analyzer',
    '@semantic-release/github',
    '@semantic-release/release-notes-generator',
    'lint-staged',
    // semantic-release itself is invoked from .github/workflows/deploy.yml,
    // which knip does not parse.
    'semantic-release',
  ],
  ignoreBinaries: ['pwa-assets-generator', 'semantic-release'],
}

export default config
