import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { readHub } from '../../server/hub'
import { ADMIN_PERMISSION, hasPermission } from '../../server/operator'

/**
 * The audit of the administration of Hub.
 *
 * The page is the trail of the changes: the rows of Hub, and the export of
 * the trail for the operator who hands it to somebody else.
 */
export default async function Audit(c: Context) {
  const operator = c.get('operator')
  if (!hasPermission(operator.scope, ADMIN_PERMISSION)) {
    return c.text('the audit needs the permission gantry.admin', 403)
  }
  const tenant = operator.scope.platform ? c.req.query('tenant') : operator.scope.tenantSlug
  const action = c.req.query('action')

  const hub = await readHub(env(c) as Record<string, unknown>)
  const page = await hub.admin(operator.credential).audit({
    ...(tenant ? { tenant } : {}),
    ...(action ? { action } : {}),
    limit: 100,
  })

  const exportUrl = `/api/hub/audit/export?format=csv${tenant ? `&tenant=${tenant}` : ''}`

  return c.render(
    <section>
      <h1>The audit of the administration</h1>
      <p id="audit-scope">
        {operator.scope.platform
          ? 'every tenant of the platform'
          : `the tenant ${operator.scope.tenantSlug}`}
      </p>
      <form class="form" method="get" action="/hub/audit">
        <label>
          the action
          <input name="action" type="text" value={action ?? ''} />
        </label>
        <button type="submit">the filter</button>
      </form>
      <p>
        <a href={exportUrl} id="audit-export">
          the export of the trail
        </a>
      </p>
      <table id="audit">
        <caption>the trail of the changes</caption>
        <thead>
          <tr>
            <th>the moment</th>
            <th>the action</th>
            <th>the tenant</th>
            <th>the target</th>
            <th>the operator</th>
          </tr>
        </thead>
        <tbody>
          {page.records.map((record) => (
            <tr key={record.id}>
              <td>{record.at}</td>
              <td>{record.action}</td>
              <td>{record.tenant ?? ''}</td>
              <td>{record.targetId ?? ''}</td>
              <td>{record.operator ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
