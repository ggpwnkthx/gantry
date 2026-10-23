import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { z } from 'zod'
import { writeAudit } from '../../../server/audit'
import { readHub } from '../../../server/hub'
import { hasPermission, PLATFORM_PERMISSION } from '../../../server/operator'

/**
 * The rollback of the route table of the deployment.
 *
 * The rollback is a write of the deployment, and it is the one write that
 * uses the token of the scope `config` of the control plane. The plan
 * gives it to the operators of the platform only, and so does this route.
 */

/** The body of the request. */
const BodySchema = z.object({
  revision: z.coerce.number().int().min(0),
  expectedRevision: z.coerce.number().int().min(0),
})

async function rollback(c: Context) {
  const operator = c.get('operator')
  if (!hasPermission(operator.scope, PLATFORM_PERMISSION)) {
    return c.json(
      { error: 'forbidden', message: 'the rollback needs the permission gantry.platform' },
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
    const answer = await hub.control().rollback(body.revision, body.expectedRevision)
    writeAudit({
      requestId: c.get('requestId') ?? '',
      operator: operator.scope.email ?? '',
      principalId: operator.scope.subject,
      tenant: operator.scope.tenantSlug,
      action: 'config.rollback',
      target: `the revision ${body.revision}`,
      answer: `ok: the revision ${answer.revision}`,
    })
    return c.json({ revision: answer.revision })
  } catch (error) {
    writeAudit({
      requestId: c.get('requestId') ?? '',
      operator: operator.scope.email ?? '',
      principalId: operator.scope.subject,
      tenant: operator.scope.tenantSlug,
      action: 'config.rollback',
      target: `the revision ${body.revision}`,
      answer: `refused: ${String(error)}`,
    })
    return c.json({ error: 'refused', message: String(error) }, 502)
  }
}

/** The write is a POST: the methods of the route of the administration. */
export const POST = [rollback]
