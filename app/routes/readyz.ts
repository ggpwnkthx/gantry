import { env } from 'hono/adapter'
import { readPublicKey } from '../server/config'

/**
 * The probe of the readiness.
 *
 * The answer says that the configuration is loaded and that the public key
 * of the identity of Shuttle is parsed. It does not depend on Hub: a Hub
 * outage does not pull Gantry out of the rotation.
 */
export default async function readyz(c: { env?: unknown }) {
  const environment = env(c as never) as Record<string, unknown>
  try {
    await readPublicKey(environment)
  } catch (error) {
    return new Response(`the configuration is not loaded: ${String(error)}`, { status: 503 })
  }
  return new Response('ready', { headers: { 'content-type': 'text/plain' } })
}
