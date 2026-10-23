import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { Counter } from '../islands/Counter'
import { readHub } from '../server/hub'
import { ADMIN_PERMISSION, STATUS_PERMISSION } from '../server/operator'

/**
 * The one page of the milestone 1.
 *
 * The page says who the caller is, what it may do and what its tenant
 * holds. The principals of the tenant are read with the credential of the
 * scope of the caller: a tenant operator reads the principals of its own
 * tenant and nothing else, because Hub refuses the calls of a credential
 * of a tenant that go beyond it.
 */
export default async function Home(c: Context) {
  const operator = c.get('operator')
  const scope = operator.scope
  const hub = await readHub(env(c) as Record<string, unknown>)

  const tenants = scope.platform ? await hub.admin(operator.credential).tenants() : []
  const principals = await hub.admin(operator.credential).principals({ tenant: scope.tenantSlug })

  return c.render(
    <section>
      <h1>Gantry</h1>
      <p id="identity">the caller is {scope.subject}</p>
      <p id="email">the e-mail of the caller is {scope.email ?? 'unknown'}</p>
      <p id="tenant">the tenant of the caller is {scope.tenantSlug}</p>
      <p id="keys">the keys of the caller are {scope.permissionKeys.join(', ')}</p>
      <p id="scope">
        the scope of the caller is {scope.platform ? 'the platform' : 'its own tenant'}
      </p>
      <p id="permissions">
        the caller may look at the status:{' '}
        {String(scope.permissionKeys.includes(STATUS_PERMISSION))}, the caller may change something:{' '}
        {String(scope.permissionKeys.includes(ADMIN_PERMISSION))}
      </p>

      {scope.platform ? (
        <table id="tenants">
          <caption>the tenants of the platform</caption>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id}>
                <td>{tenant.slug}</td>
                <td>{tenant.displayName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table id="principals">
          <caption>the principals of the tenant {scope.tenantSlug}</caption>
          <tbody>
            {principals.map((principal) => (
              <tr key={principal.id}>
                <td>{principal.email ?? principal.externalSubject}</td>
                <td>{principal.displayName ?? ''}</td>
                <td>{principal.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Counter label="clicks">
        <span id="slot-child">the child of the island</span>
      </Counter>
    </section>
  )
}

/**
 * The methods of the route of the administration.
 *
 * The administration of Gantry is the milestone 3: the route exists, and
 * it says that it is not there yet. The identity and the scope of the
 * caller are checked before this answer, so a request without them is
 * refused with a `401` or a `403` and not with a `405`.
 */
const notImplemented = async (c: Context) =>
  c.json(
    {
      error: 'not_implemented',
      message: 'the administration of Gantry arrives in the milestone 3',
    },
    405
  )

export const POST = [notImplemented]
export const PUT = [notImplemented]
export const DELETE = [notImplemented]
