import type { MiddlewareHandler } from 'hono'
import { env } from 'hono/adapter'
import type { KeyInput } from 'jose'
import { readPublicKey } from '../server/config'
import { type UpstreamIdentity, verifyIdentity } from '../server/identity'
import { scopeCache } from '../server/cache'
import { HubError } from '../server/clients/hub-admin'
import { type Hub, readHub } from '../server/hub'
import { type ResolvedOperator, resolveOperatorScope, ScopeError } from '../server/operator'

/**
 * The paths that are answered without an identity.
 *
 * The probes of the deployment have to answer while Hub is down and while
 * Shuttle is down, so they are not behind the identity check.
 */
const EXEMPT_PATHS = new Set(['/healthz', '/readyz'])

/** The bindings of the context: the identity and the scope of the caller. */
export type IdentityEnv = {
  Variables: {
    identity: UpstreamIdentity
    operator: ResolvedOperator
  }
}

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

/**
 * The check of the scope of the caller.
 *
 * The scope says what the caller may do inside Gantry, and Hub decides it:
 * Gantry reads the principal of the caller, it reads the keys that Hub
 * holds for the caller on the route of Gantry, and it chooses the
 * credential of the tenant of the caller. A caller without a scope is
 * refused with a `403`.
 */
export const scopeMiddleware: MiddlewareHandler<IdentityEnv> = async (c, next) => {
  const url = new URL(c.req.url)
  if (EXEMPT_PATHS.has(url.pathname)) {
    await next()
    return
  }

  const identity = c.get('identity')
  if (!identity) {
    return c.text('the identity of the request is not verified', 401)
  }

  const cached = scopeCache.get(identity.subject)
  if (cached) {
    c.set('operator', cached)
    await next()
    return
  }

  const environment = env(c) as Record<string, unknown>
  let hub: Hub
  try {
    hub = await readHub(environment)
  } catch (error) {
    return c.text(`the configuration of Hub is not loaded: ${String(error)}`, 500)
  }

  try {
    const operator = await resolveOperatorScope({
      identity,
      credentials: hub.credentials,
      admin: hub.admin,
      accessContext: hub.accessContext(),
    })
    scopeCache.set(identity.subject, operator, operator.validUntil)
    c.set('operator', operator)
  } catch (error) {
    if (error instanceof ScopeError) {
      return c.text(`the caller has no scope: ${error.message}`, 403)
    }
    if (error instanceof HubError) {
      return c.text(`the access service is not available: ${error.message}`, 503)
    }
    throw error
  }
  await next()
}

export default [identityMiddleware, scopeMiddleware]
