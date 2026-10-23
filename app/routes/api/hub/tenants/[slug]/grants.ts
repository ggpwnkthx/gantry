import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { z } from 'zod'
import { writeAudit } from '../../../../../server/audit'
import { readHub } from '../../../../../server/hub'
import { ADMIN_PERMISSION, hasPermission } from '../../../../../server/operator'

/**
 * The write of a grant of a tenant.
 *
 * The write goes to Hub, and Hub writes the row of its audit. The console
 * writes its own line too: Hub's audit names the credential of the console,
 * and the line of the console names the person.
 */

/** The body of the request. */
const BodySchema = z.object({
  subject: z.string().min(1),
  permission: z.string().min(1),
  routeId: z.string().min(1).optional(),
})

async function writeGrant(c: Context) {
  const operator = c.get('operator')
  if (!hasPermission(operator.scope, ADMIN_PERMISSION)) {
    return c.json(
      { error: 'forbidden', message: 'the write needs the permission gantry.admin' },
      403
    )
  }
  const tenant = c.req.param('slug') ?? operator.scope.tenantSlug
  if (tenant !== operator.scope.tenantSlug && !operator.scope.platform) {
    return c.json(
      { error: 'forbidden', message: 'the write is outside the tenant of the caller' },
      403
    )
  }
  const parsed = BodySchema.safeParse(await c.req.parseBody().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'bad_request', message: 'the body is not understood' }, 400)
  }
  const body = parsed.data
  const isGroup = body.subject.startsWith('group:')
  const subject = isGroup ? body.subject.slice('group:'.length) : body.subject.slice('user:'.length)

  const hub = await readHub(env(c) as Record<string, unknown>)
  try {
    const grant = await hub.admin(operator.credential).putGrant({
      tenant,
      ...(isGroup ? { group: subject } : { userId: subject }),
      permission: body.permission,
      ...(body.routeId ? { routeId: body.routeId } : {}),
      grantedBy: operator.scope.email,
    })
    writeAudit({
      requestId: c.get('requestId') ?? '',
      operator: operator.scope.email ?? '',
      principalId: operator.scope.subject,
      tenant,
      action: 'grant.updated',
      target: `${body.permission} on ${body.routeId ?? 'every route'}`,
      answer: 'ok',
    })
    return c.json({ id: grant.id, permission: grant.permission }, 201)
  } catch (error) {
    writeAudit({
      requestId: c.get('requestId') ?? '',
      operator: operator.scope.email ?? '',
      principalId: operator.scope.subject,
      tenant,
      action: 'grant.updated',
      target: `${body.permission} on ${body.routeId ?? 'every route'}`,
      answer: `refused: ${String(error)}`,
    })
    return c.json({ error: 'refused', message: String(error) }, 502)
  }
}

/** The write is a POST: the methods of the route of the administration. */
export const POST = [writeGrant]
