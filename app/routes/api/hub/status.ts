import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { readSettings } from '../../../server/config'
import { forScope, readStatus } from '../../../server/status'

/**
 * The status of Hub, for the island.
 *
 * The endpoint is same-origin and it needs the identity and the scope of
 * the caller like every other route of Gantry.
 */
export default async function hubStatus(c: Context) {
  const settings = await readSettings(env(c) as Record<string, unknown>)
  const operator = c.get('operator')
  const status = forScope(
    await readStatus({
      service: 'hub',
      replicas: settings.hubReplicas,
      ...(settings.hubMetricsToken ? { metricsToken: settings.hubMetricsToken } : {}),
    }),
    operator.scope
  )
  return c.json(status)
}
