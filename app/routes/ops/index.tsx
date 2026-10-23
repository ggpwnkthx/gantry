import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { z } from 'zod'
import { PurgeDialog } from '../../islands/PurgeDialog'
import { RouteTable, type Revision } from '../../islands/RouteTable'
import { readHub } from '../../server/hub'
import {
  ADMIN_PERMISSION,
  hasPermission,
  PLATFORM_PERMISSION,
  STATUS_PERMISSION,
} from '../../server/operator'

/**
 * The operations of the gateway.
 *
 * The page holds the route table of the deployment and the purges: the
 * sessions of a subject and the cached decisions of a subject. The
 * rollback of the table is for the operators of the platform.
 */

/** A route of the table of the deployment. */
const RouteSchema = z.object({
  id: z.string(),
  match: z.object({ methods: z.array(z.string()).optional() }).optional(),
  upstream: z.string().optional(),
})

export default async function Operations(c: Context) {
  const operator = c.get('operator')
  if (!hasPermission(operator.scope, STATUS_PERMISSION)) {
    return c.text('the operations of the gateway need the permission gantry.status', 403)
  }
  const hub = await readHub(env(c) as Record<string, unknown>)

  let active = 0
  let activeRoutes: Revision['routes'] = []
  let revisions: Revision[] = []
  let controlAvailable = false
  try {
    const config = await hub.control().activeConfig()
    const table = config.table as { routes?: unknown } | null
    const routes = z.array(RouteSchema).safeParse(table?.routes ?? [])
    activeRoutes = routes.success
      ? routes.data.map((route) => ({
          id: route.id,
          methods: route.match?.methods ?? [],
          upstream: route.upstream ?? '',
        }))
      : []
    active = config.revision
    controlAvailable = true
    const history = await hub.control().history()
    revisions = history.entries.map((entry) => {
      const tableOf = entry.table as { routes?: unknown } | null
      const parsed = z.array(RouteSchema).safeParse(tableOf?.routes ?? [])
      return {
        revision: entry.revision,
        author: entry.author ?? undefined,
        createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : undefined,
        routes: parsed.success
          ? parsed.data.map((route) => ({
              id: route.id,
              methods: route.match?.methods ?? [],
              upstream: route.upstream ?? '',
            }))
          : [],
      }
    })
  } catch {
    controlAvailable = false
  }

  const mayPurge = hasPermission(operator.scope, ADMIN_PERMISSION)
  const mayRollback = hasPermission(operator.scope, PLATFORM_PERMISSION)

  return c.render(
    <section>
      <h1>The operations of the gateway</h1>
      {controlAvailable ? (
        <RouteTable
          active={active}
          activeRoutes={activeRoutes}
          revisions={revisions}
          mayRollback={mayRollback}
        />
      ) : (
        <p id="no-control">
          the control plane of Shuttle is not there: the route table and the purges are not
          reachable
        </p>
      )}
      {mayPurge ? (
        <>
          <PurgeDialog kind="sessions" />
          <PurgeDialog kind="decisions" />
        </>
      ) : (
        <p id="no-purge">the purges need the permission gantry.admin</p>
      )}
    </section>
  )
}
