import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The stack of the development, with a browser in front of it.
 *
 * The test proves the four halves of the security model and of the status
 * of the plan:
 *
 * 1. a browser that logs in at the gateway reaches the page of Gantry, and
 *    the identity of the caller is verified,
 * 2. the scope of the caller is the one of Hub: a tenant operator sees the
 *    numbers of its own tenant and nothing else,
 * 3. the numbers of the services are the numbers of the real services, and
 *    the panels that a service does not carry yet say so,
 * 4. a request that skips the gateway is refused with a `401`.
 */

/** The stack, as the script of the stack writes it. */
interface Stack {
  hub: string
  shuttle: string
  gantry: string
  login: string
  provider: string
  tenant: string
  otherTenant: string
  principal: string
  operator: string
  subjects: { alice: string; operator: string; bob: string }
}

/** The console of the browser. */
const messages: string[] = []

/** Reads the description of the stack, when the script has written it. */
async function readStack(): Promise<Stack> {
  const file = join(process.cwd(), '.deps', 'stack.json')
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(file)) {
      return JSON.parse(await readFile(file, 'utf8')) as Stack
    }
    await wait(500)
  }
  throw new Error('the stack did not write its description')
}

/** Waits, without the runtime of the tests: the workers of the browser may
 * run under Node and not under Bun. */
function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

test('a browser logs in at the gateway and reaches the status of the gateway', async ({ page }) => {
  const stack = await readStack()
  messages.length = 0
  page.on('console', (message) => {
    messages.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    messages.push(`pageerror: ${error.message}`)
  })

  await page.goto(stack.login)

  // The page of Gantry is reached, and the identity of the caller is the
  // one of the principal of Hub.
  await expect(page.locator('#scope-header')).toContainText(stack.tenant)

  // The numbers of the gateway are the numbers of the real gateway, and
  // its replica is ready.
  await expect(page.locator('#replicas')).toContainText('ready')
  await expect(page.locator('[data-tile="the requests"]')).toContainText(/\d+/)
  await expect(page.locator('[data-tile="the failures of the upstreams"]')).toBeVisible()

  // The panels that need a change of Shuttle say so.
  await expect(page.locator('#pending')).toContainText('needs Shuttle 1.4.0')

  // The island of the page hydrates: the console of the browser is empty.
  expect(messages).toEqual([])
})

test('a browser reads the status of Hub', async ({ page }) => {
  const stack = await readStack()
  await page.goto(stack.login)
  await page.goto(`${stack.shuttle}/hub`)

  await expect(page.locator('h1')).toContainText('Hub')
  await expect(page.locator('#replicas')).toContainText('ready')
  await expect(page.locator('[data-tile="the decisions"]')).toContainText(/\d+/)
  await expect(page.locator('#pending')).toContainText('needs Hub 1.0.2')
})

test('a tenant operator reads the numbers of its own tenant and nothing else', async ({ page }) => {
  const stack = await readStack()
  await page.goto(stack.login)
  await page.goto(`${stack.shuttle}/hub`)

  // The breakdown by tenant of the decisions of Hub: a tenant operator
  // reads the row of its own tenant and not the row of the other tenant.
  const breakdown = page.locator('table', { hasText: 'the decisions by tenant' })
  await expect(breakdown).toContainText(stack.tenant)
  await expect(breakdown).not.toContainText(stack.otherTenant)
})

test('an operator of the platform reads the numbers of every tenant', async ({ browser }) => {
  const stack = await readStack()

  // The provider of the identity authenticates the next caller as the
  // operator of the platform.
  await fetch(
    `${stack.provider}/as/${stack.subjects.operator}/${encodeURIComponent('operator@acme.example')}`
  )

  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(stack.login)

  await expect(page.locator('#scope-header')).toContainText('the platform')
  await page.goto(`${stack.shuttle}/hub`)
  const breakdown = page.locator('table', { hasText: 'the decisions by tenant' })
  await expect(breakdown).toContainText(stack.tenant)
  await expect(breakdown).toContainText(stack.otherTenant)
  await context.close()
})

test('a request that skips the gateway is refused', async ({ request }) => {
  const stack = await readStack()
  const response = await request.get(`${stack.gantry}/shuttle`)
  expect(response.status()).toBe(401)
})
