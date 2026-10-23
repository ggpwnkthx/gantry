import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The stack of the development, with a browser in front of it.
 *
 * The test proves the three halves of the security model of the plan:
 *
 * 1. a browser that logs in at the gateway reaches the page of Gantry, and
 *    the identity of the caller is verified,
 * 2. the scope of the caller is the one of Hub: a tenant operator sees the
 *    principals of its own tenant and nothing else, and an operator of the
 *    platform sees the tenants,
 * 3. a request that skips the gateway is refused with a `401`: the request
 *    that did not go through Shuttle cannot act as anyone.
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

/** Waits, without the runtime of the tests: the workers of the browser may
 * run under Node and not under Bun. */
function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

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

/** The console of the browser. */
const messages: string[] = []

test('a browser logs in at the gateway and reaches Gantry', async ({ page }) => {
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
  await expect(page.locator('#identity')).toContainText(stack.principal)

  // The scope of the caller is the one of Hub: the tenant of the caller
  // and the keys that Hub holds for it.
  await expect(page.locator('#tenant')).toContainText(stack.tenant)
  await expect(page.locator('#keys')).toContainText('gantry.status')
  await expect(page.locator('#scope')).toContainText('its own tenant')

  // The gate of the milestone 1: a tenant operator sees the principals of
  // its own tenant, and the principal of the other tenant of the platform
  // is not one of them.
  await expect(page.locator('#principals')).toContainText('alice@acme.example')
  await expect(page.locator('#principals')).not.toContainText('bob@globex.example')

  // The island of the page hydrates in the output of the build.
  const button = page.locator('#counter')
  await expect(button).toHaveText('clicks: 0')
  await button.click()
  await expect(button).toHaveText('clicks: 1')
  await expect(page.locator('#slot-child')).toHaveText('the child of the island')

  expect(messages).toEqual([])
})

test('an operator of the platform sees the tenants of the platform', async ({ browser }) => {
  const stack = await readStack()

  // The provider of the identity authenticates the next caller as the
  // operator of the platform.
  await fetch(
    `${stack.provider}/as/${stack.subjects.operator}/${encodeURIComponent('operator@acme.example')}`
  )

  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(stack.login)

  await expect(page.locator('#scope')).toContainText('the platform')
  await expect(page.locator('#tenants')).toContainText(stack.tenant)
  await expect(page.locator('#tenants')).toContainText(stack.otherTenant)
  await context.close()
})

test('a request that skips the gateway is refused', async ({ request }) => {
  const stack = await readStack()
  const response = await request.get(`${stack.gantry}/`)
  expect(response.status()).toBe(401)
})
