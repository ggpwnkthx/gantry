import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { LiveStatus } from '../../islands/LiveStatus'
import { readSettings } from '../../server/config'
import { hasPermission, STATUS_PERMISSION } from '../../server/operator'
import { forScope, readStatus } from '../../server/status'

/**
 * The status of the gateway.
 *
 * The page is rendered on the server with the numbers of the moment, and
 * the island reads them again every fifteen seconds. The page needs the
 * permission of the status: the numbers of the gateway are the numbers of
 * the platform.
 */
export default async function ShuttleScreen(c: Context) {
  const operator = c.get('operator')
  if (!hasPermission(operator.scope, STATUS_PERMISSION)) {
    return c.text('the status of the platform needs the permission gantry.status', 403)
  }
  const settings = await readSettings(env(c) as Record<string, unknown>)
  const status = forScope(
    await readStatus({
      service: 'shuttle',
      replicas: settings.shuttleReplicas,
      ...(settings.shuttleMetricsToken ? { metricsToken: settings.shuttleMetricsToken } : {}),
    }),
    operator.scope
  )
  return c.render(
    <section>
      <h1>The status of the gateway</h1>
      <LiveStatus service="shuttle" initial={status} refreshMs={settings.refreshMs}>
        <p id="slot-child">the numbers are of the platform</p>
      </LiveStatus>
    </section>
  )
}
