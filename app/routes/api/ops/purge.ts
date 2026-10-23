import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { z } from 'zod'
import { writeAudit } from '../../../server/audit'
import { readHub } from '../../../server/hub'
import { ADMIN_PERMISSION, hasPermission } from '../../../server/operator'

/**
 * The purge of the sessions or of the cached decisions of a subject.
 *
 * The purge goes to the control plane of Shuttle, and the answer of the
 * control plane is the number of the things that are gone. The console
 * writes its own line: the audit of the control plane names the operator
 * of the token, and the operator of the token is the console.
 */

/** The body of the request. */
const BodySchema = z.object({
  kind: z.enum(['sessions', 'decisions']),
  subject: z.string().min(1),
})

async function purge(c: Context) {
  const operator = c.get('operator')
  if (!hasPermission(operator.scope, ADMIN_PERMISSION)) {
    return c.json(
      { error: 'forbidden', message: 'the purge needs the permission gantry.admin' },
      403
    )
  }
  const parsed = BodySchema.safeParse(await c.req.parseBody().catch(() => ({})))
  if (!parsed.success) {
    return c.json({ error: 'bad_request', message: 'the body is not understood' }, 400)
  }
  const body = parsed.data
  const hub = await readHub(env(c) as Record<string, unknown>)
  try {
    const count =
      body.kind === 'sessions'
        ? (await hub.control().revokeSessions(body.subject)).revoked
        : (await hub.control().purgeDecisions(body.subject)).purged
    writeAudit({
      requestId: c.get('requestId') ?? '',
      operator: operator.scope.email ?? '',
      principalId: operator.scope.subject,
      tenant: operator.scope.tenantSlug,
      action: body.kind === 'sessions' ? 'sessions.revoked' : 'decisions.purged',
      target: body.subject,
      answer: `ok: ${count}`,
    })
    return c.json({ kind: body.kind, subject: body.subject, count })
  } catch (error) {
    writeAudit({
      requestId: c.get('requestId') ?? '',
      operator: operator.scope.email ?? '',
      principalId: operator.scope.subject,
      tenant: operator.scope.tenantSlug,
      action: body.kind === 'sessions' ? 'sessions.revoked' : 'decisions.purged',
      target: body.subject,
      answer: `refused: ${String(error)}`,
    })
    return c.json({ error: 'refused', message: String(error) }, 502)
  }
}

/** The write is a POST: the methods of the route of the administration. */
export const POST = [purge]
