/**
 * The audit of the writes of Gantry.
 *
 * Every write of the console writes **one line** on the standard output:
 * the request, the person who asked for it, what was written, and the
 * answer of Hub or of `shuttle-control`.
 *
 * The line is the only record of the person:
 *
 * - the audit of Hub names the fingerprint of the credential, and the
 *   credential of the console is the console,
 * - the audit of `shuttle-control` names the operator of the token, and the
 *   operator of the token is the console.
 *
 * The line is written whatever the answer is: a write that was refused is
 * a write that was refused, and it is written down.
 */

/** A line of the audit of the console. */
export interface AuditLine {
  /** The id of the request. */
  requestId: string
  /** The e-mail of the person who asked for the write. */
  operator: string
  /** The id of the principal of the person. */
  principalId: string
  /** The slug of the tenant of the write. */
  tenant: string
  /** What was written. */
  action: string
  /** What the write was about. */
  target: string
  /** The answer of Hub or of `shuttle-control`. */
  answer: string
}

/**
 * Writes one line of the audit.
 *
 * The line is a json object and nothing else: a log that an operator reads
 * with `jq` is a log that an operator reads.
 */
export function writeAudit(line: AuditLine): void {
  console.log(
    JSON.stringify({
      level: 'audit',
      at: new Date().toISOString(),
      requestId: line.requestId,
      operator: line.operator,
      principalId: line.principalId,
      tenant: line.tenant,
      action: line.action,
      target: line.target,
      answer: line.answer,
    })
  )
}
