import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { keyFiles } from '../helpers/keys'
import { signIdentity } from '../helpers/signing'

/**
 * The island of the status, in the built output.
 *
 * The test proves three things:
 *
 * 1. the island hydrates: the numbers of the service are on the page and
 *    the console of the browser stays empty,
 * 2. the child that the server passed as a prop is in the island,
 * 3. the island reads the status again: the numbers move.
 */

const privateKeyPem = readFileSync(keyFiles.privateKey, 'utf8')

/** The messages of the console of the browser. */
const messages: string[] = []

test.beforeEach(async ({ page, baseURL }) => {
  messages.length = 0
  page.on('console', (message) => {
    messages.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    messages.push(`pageerror: ${error.message}`)
  })

  // The requests are signed the way Shuttle signs them: the identity of
  // the caller is in the headers and the signature covers the request.
  const origin = new URL(baseURL ?? 'http://127.0.0.1').origin
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== origin) {
      await route.continue()
      return
    }
    const signature = await signIdentity({
      privateKeyPem,
      identity: {
        subject: 'the-subject-of-the-caller',
        email: 'alice@shuttle.test',
        roles: ['gantry.status'],
      },
      request: {
        method: request.method(),
        path: url.pathname,
        query: url.search,
        host: url.host,
      },
    })
    await route.continue({
      headers: {
        ...request.headers(),
        'x-shuttle-user': 'the-subject-of-the-caller',
        'x-shuttle-email': 'alice@shuttle.test',
        'x-shuttle-roles': 'gantry.status',
        'x-forwarded-host': url.host,
        'x-shuttle-signature': signature,
      },
    })
  })
})

test('the island hydrates, keeps the child of the server and reads the status again', async ({
  page,
}) => {
  await page.goto('/shuttle')

  // The numbers of the service are on the page, rendered by the server.
  const requests = page.locator('[data-tile="the requests"]')
  await expect(requests).toContainText(/\d+/)
  const first = await requests.textContent()

  // The child of the server is in the island.
  await expect(page.locator('#slot-child')).toHaveText('the numbers are of the platform')

  // The island reads the status again: the number of the requests moves.
  await expect.poll(async () => await requests.textContent(), { timeout: 15_000 }).not.toBe(first)

  // The hydration is clean.
  expect(messages).toEqual([])
})

test('a request without a signature is refused', async ({ page, context }) => {
  // The route of the test signs every request: the request of this test
  // goes out without the headers of the identity.
  await page.unroute('**/*')
  const response = await context.request.get('/shuttle')
  expect(response.status()).toBe(401)
})
