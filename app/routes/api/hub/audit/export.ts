import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { readHub } from '../../../../server/hub'
import { ADMIN_PERMISSION, hasPermission } from '../../../../server/operator'

/**
 * The export of the audit of Hub.
 *
 * The export is the same trail as the one of the page, in a file: an
 * operator who hands the history of the platform to somebody else needs a
 * file, and not a page.
 */
export default async function exportAudit(c: Context) {
  const operator = c.get('operator')
  if (!hasPermission(operator.scope, ADMIN_PERMISSION)) {
    return c.text('the export of the audit needs the permission gantry.admin', 403)
  }
  const format = c.req.query('format') === 'jsonl' ? 'jsonl' : 'csv'
  const tenant = operator.scope.platform ? c.req.query('tenant') : operator.scope.tenantSlug
  const hub = await readHub(env(c) as Record<string, unknown>)
  const text = await hub
    .admin(operator.credential)
    .auditExport({ format, ...(tenant ? { tenant } : {}) })
  return new Response(text, {
    headers: {
      'content-type': format === 'csv' ? 'text/csv' : 'application/x-ndjson',
      'content-disposition': `attachment; filename="hub-audit-${format}"`,
    },
  })
}
