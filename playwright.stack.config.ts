import { defineConfig } from '@playwright/test'

/**
 * The tests of the browser against the **development stack**.
 *
 * The stack is the real one: Hub, Shuttle and Gantry, with the revisions
 * that `compatibility.json` pins. The test logs a browser in at the gateway
 * and it checks that the page of Gantry is reached with a verified
 * identity, and that a request that skips the gateway is refused.
 */
const shuttlePort = Number(process.env.GANTRY_DEV_SHUTTLE_PORT ?? 8080)
const shuttleUrl = `http://127.0.0.1:${shuttlePort}`

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/stack.browser.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: shuttleUrl,
  },
  webServer: {
    command: 'bun run scripts/dev-stack.ts',
    url: `${shuttleUrl}/healthz`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
