import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { readHub } from '../../../server/hub'
import { ADMIN_PERMISSION, hasPermission } from '../../../server/operator'

/**
 * The tenants of the platform.
 *
 * The page is for the operators of the platform: they see every tenant.
 * A tenant operator is sent to the tenant of its own.
 */
export default async function Tenants(c: Context) {
  const operator = c.get('operator')
  if (!hasPermission(operator.scope, ADMIN_PERMISSION)) {
    return c.text('the administration needs the permission gantry.admin', 403)
  }
  if (!operator.scope.platform) {
    return c.redirect(`/hub/tenants/${operator.scope.tenantSlug}`)
  }
  const hub = await readHub(env(c) as Record<string, unknown>)
  const tenants = await hub.admin(operator.credential).tenants()
  return c.render(
    <section>
      <h1>The tenants of the platform</h1>
      <table id="tenants">
        <caption>the tenants</caption>
        <thead>
          <tr>
            <th>the tenant</th>
            <th>the name</th>
            <th>the principals</th>
            <th>the grants</th>
            <th>the state</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr key={tenant.id}>
              <td>
                <a href={`/hub/tenants/${tenant.slug}`}>{tenant.slug}</a>
              </td>
              <td>{tenant.displayName}</td>
              <td>{tenant.userCount ?? 0}</td>
              <td>{tenant.grantCount ?? 0}</td>
              <td>{tenant.enabled === false ? 'disabled' : 'enabled'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
