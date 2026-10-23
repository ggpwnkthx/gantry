import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { readSettings } from '../../../server/config'
import { forScope, readStatus } from '../../../server/status'

/**
 * The status of the gateway, for the island.
 *
 * The endpoint is same-origin and it needs the identity and the scope of
 * the caller like every other route of Gantry: the numbers of the
 * gateway are the numbers of the platform.
 */
export default async function shuttleStatus(c: Context) {
  const settings = await readSettings(env(c) as Record<string, unknown>)
  const operator = c.get('operator')
  const status = forScope(
    await readStatus({
      service: 'shuttle',
      replicas: settings.shuttleReplicas,
      ...(settings.shuttleMetricsToken ? { metricsToken: settings.shuttleMetricsToken } : {}),
    }),
    operator.scope
  )
  return c.json(status)
}
