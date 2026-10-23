import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The stack of the development, with a browser in front of it.
 *
 * The test proves the two halves of the security model of the plan:
 *
 * 1. a browser that logs in at the gateway reaches the page of Gantry, and
 *    the identity of the caller is verified,
 * 2. a request that skips the gateway is refused with a `401`: the request
 *    that did not go through Shuttle cannot act as anyone.
 */

/** The stack, as the script of the stack writes it. */
interface Stack {
  hub: string
  shuttle: string
  gantry: string
  login: string
  tenant: string
  principal: string
}

/** Reads the description of the stack, when the script has written it. */
async function readStack(): Promise<Stack> {
  const file = join(process.cwd(), '.deps', 'stack.json')
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(file)) {
      return JSON.parse(await readFile(file, 'utf8')) as Stack
    }
    await Bun.sleep(500)
  }
  throw new Error('the stack did not write its description')
}

test('a browser logs in at the gateway and reaches Gantry', async ({ page }) => {
  const stack = await readStack()

  const messages: string[] = []
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

  // The island of the page hydrates in the output of the build.
  const button = page.locator('#counter')
  await expect(button).toHaveText('clicks: 0')
  await button.click()
  await expect(button).toHaveText('clicks: 1')
  await expect(page.locator('#slot-child')).toHaveText('the child of the island')

  expect(messages).toEqual([])
})

test('a request that skips the gateway is refused', async ({ request }) => {
  const stack = await readStack()
  const response = await request.get(`${stack.gantry}/`)
  expect(response.status()).toBe(401)
})
