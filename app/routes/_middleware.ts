import type { MiddlewareHandler } from 'hono'
import { env } from 'hono/adapter'
import type { KeyInput } from 'jose'
import { readPublicKey } from '../server/config'
import { type UpstreamIdentity, verifyIdentity } from '../server/identity'

/**
 * The paths that are answered without an identity.
 *
 * The probes of the deployment have to answer while Hub is down and while
 * Shuttle is down, so they are not behind the identity check.
 */
const EXEMPT_PATHS = new Set(['/healthz', '/readyz'])

/** The bindings of the context: the identity of the caller. */
export type IdentityEnv = { Variables: { identity: UpstreamIdentity } }

/**
 * The check of the identity of a request.
 *
 * Shuttle signs the identity of every request it forwards, and Gantry
 * verifies the signature with the public key of the deployment. A request
 * without a valid signature is refused with a `401`: a request that skipped
 * Shuttle cannot act as anyone.
 */
export const identityMiddleware: MiddlewareHandler<IdentityEnv> = async (c, next) => {
  const url = new URL(c.req.url)
  if (EXEMPT_PATHS.has(url.pathname)) {
    await next()
    return
  }

  const environment = env(c) as Record<string, unknown>
  let publicKey: KeyInput
  try {
    publicKey = await readPublicKey(environment)
  } catch (error) {
    return c.text(`the identity of Shuttle is not configured: ${String(error)}`, 500)
  }

  const result = await verifyIdentity({
    request: {
      method: c.req.method,
      path: url.pathname,
      query: url.search,
      host: c.req.header('x-forwarded-host') ?? '',
    },
    headers: {
      'x-shuttle-user': c.req.header('x-shuttle-user') ?? '',
      'x-shuttle-email': c.req.header('x-shuttle-email'),
      'x-shuttle-roles': c.req.header('x-shuttle-roles'),
      'x-shuttle-workspace': c.req.header('x-shuttle-workspace'),
      'x-shuttle-signature': c.req.header('x-shuttle-signature'),
    },
    publicKey,
  })

  if (!result.ok) {
    return c.text(`the identity of the request is not verified: ${result.reason}`, 401)
  }

  c.set('identity', result.identity)
  await next()
}

export default [identityMiddleware]
