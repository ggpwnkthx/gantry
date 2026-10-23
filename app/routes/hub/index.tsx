import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { LiveStatus } from '../../islands/LiveStatus'
import { readSettings } from '../../server/config'
import { hasPermission, STATUS_PERMISSION } from '../../server/operator'
import { forScope, readStatus } from '../../server/status'

/**
 * The status of Hub.
 *
 * The page is rendered on the server with the numbers of the moment, and
 * the island reads them again every fifteen seconds.
 */
export default async function HubScreen(c: Context) {
  const operator = c.get('operator')
  if (!hasPermission(operator.scope, STATUS_PERMISSION)) {
    return c.text('the status of the platform needs the permission gantry.status', 403)
  }
  const settings = await readSettings(env(c) as Record<string, unknown>)
  const status = forScope(
    await readStatus({
      service: 'hub',
      replicas: settings.hubReplicas,
      ...(settings.hubMetricsToken ? { metricsToken: settings.hubMetricsToken } : {}),
    }),
    operator.scope
  )
  return c.render(
    <section>
      <h1>The status of Hub</h1>
      <LiveStatus service="hub" initial={status} refreshMs={settings.refreshMs}>
        <p id="slot-child">the numbers are of the platform</p>
      </LiveStatus>
    </section>
  )
}
