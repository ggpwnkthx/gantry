import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { GrantForm } from '../../../islands/GrantForm'
import { readHub } from '../../../server/hub'
import {
  ADMIN_PERMISSION,
  hasPermission,
  PLATFORM_PERMISSION,
  STATUS_PERMISSION,
} from '../../../server/operator'

/**
 * One tenant: its principals, its groups and its grants.
 *
 * The page is the administration of the tenant. The principal of the
 * caller is the person who does the work, and the credential of the
 * scope is the credential of the tenant: Hub refuses the calls of a
 * credential of a tenant that go beyond it.
 */
export default async function Tenant(c: Context) {
  const operator = c.get('operator')
  if (!hasPermission(operator.scope, ADMIN_PERMISSION)) {
    return c.text('the administration needs the permission gantry.admin', 403)
  }
  const slug = c.req.param('slug') ?? operator.scope.tenantSlug
  if (slug !== operator.scope.tenantSlug && !operator.scope.platform) {
    return c.text('the tenant is not the tenant of the caller', 403)
  }

  const hub = await readHub(env(c) as Record<string, unknown>)
  const admin = hub.admin(operator.credential)
  const [principals, groups, grants] = await Promise.all([
    admin.principals({ tenant: slug }),
    admin.groups(slug),
    admin.grants(slug),
  ])

  // The routes of the deployment, for the form of a grant: they are the
  // routes of the table that is active, when the control plane answers.
  let routes: string[] = []
  try {
    const active = await hub.control().activeConfig()
    const table = active.table as { routes?: Array<{ id?: string }> } | null
    routes = (table?.routes ?? [])
      .map((route) => route.id)
      .filter((id): id is string => typeof id === 'string')
  } catch {
    routes = []
  }

  const permissions = [STATUS_PERMISSION, ADMIN_PERMISSION, PLATFORM_PERMISSION]

  return c.render(
    <section>
      <h1>The tenant {slug}</h1>

      <table id="principals">
        <caption>the principals</caption>
        <thead>
          <tr>
            <th>the principal</th>
            <th>the name</th>
            <th>the state</th>
            <th>the last login</th>
          </tr>
        </thead>
        <tbody>
          {principals.map((principal) => (
            <tr key={principal.id}>
              <td>{principal.email ?? principal.externalSubject}</td>
              <td>{principal.displayName ?? ''}</td>
              <td>{principal.status}</td>
              <td>{principal.lastLoginAt ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table id="groups">
        <caption>the groups</caption>
        <thead>
          <tr>
            <th>the group</th>
            <th>the name</th>
            <th>the members</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.id}>
              <td>{group.key}</td>
              <td>{group.displayName ?? ''}</td>
              <td>{(group.members ?? []).length}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table id="grants">
        <caption>the grants</caption>
        <thead>
          <tr>
            <th>the permission</th>
            <th>the subject</th>
            <th>the route</th>
            <th>the workspace</th>
            <th>the one who granted it</th>
            <th>the end</th>
          </tr>
        </thead>
        <tbody>
          {grants.map((grant) => (
            <tr key={grant.id}>
              <td>{grant.permission}</td>
              <td>{grant.userId ?? grant.group ?? ''}</td>
              <td>{grant.routeId ?? 'every route'}</td>
              <td>{grant.workspaceId ?? 'every workspace'}</td>
              <td>{grant.grantedBy ?? ''}</td>
              <td>{grant.expiresAt ?? 'never'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <GrantForm
        tenant={slug}
        groups={groups.map((group) => ({ key: group.key, label: group.displayName ?? group.key }))}
        principals={principals.map((principal) => ({
          id: principal.id,
          label: principal.email ?? principal.externalSubject,
        }))}
        routes={routes}
        permissions={permissions}
      />
    </section>
  )
}
