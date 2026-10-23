import { defineConfig } from '@playwright/test'
import { ensureKeyPair } from './test/helpers/keys'

/**
 * The tests of the browser.
 *
 * The tests run against the **built** server: the build of the client and
 * the build of the server are what the deployment runs, and the island has
 * to hydrate in that output.
 *
 * The server of the tests answers only to the requests that carry a valid
 * signature of the identity: the test signs the requests the way Shuttle
 * signs them, so the identity check of Gantry is exercised as well.
 */
const keys = ensureKeyPair()

const port = Number(process.env.GANTRY_TEST_PORT ?? 3210)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/island.browser.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
  },
  webServer: {
    command: `bun run build && cd dist && PORT=${port} bun index.js`,
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY: keys.publicKeyPem,
    },
  },
})
