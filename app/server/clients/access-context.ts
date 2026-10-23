import { z } from 'zod'
import { AccessContextSchema, type AccessContextAnswer } from '../schemas/hub'
import { HubError } from './hub-admin'

/**
 * The client of the access context of Hub.
 *
 * The access context is the contract that answers the **complete** set of
 * the capabilities of a principal, for a workspace and a route. The
 * credential of the contract is a read only credential of its own: it is
 * not the credential of the gateway and not the credential of the
 * administration.
 */

/** The body of a request of the access context, as Hub understands it. */
export const AccessContextRequestSchema = z.object({
  version: z.literal(1),
  subject: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  routeId: z.string().min(1),
})

/** The options of the client. */
export interface AccessContextClientOptions {
  /** The url of Hub. */
  url: string
  /** The credential of the access context. */
  credential: string
  /** The timeout of a call, in milliseconds. */
  timeoutMs?: number
}

/** The client of the access context of Hub. */
export class AccessContextClient {
  readonly #options: AccessContextClientOptions

  constructor(options: AccessContextClientOptions) {
    this.#options = options
  }

  /**
   * Asks for the context of a principal.
   *
   * The `workspaceId` is the placeholder of the question about a route:
   * Hub refuses an empty one (the decision D-003 of `docs/decisions.md`),
   * and the field is not a uuid, so the name of the tenant is a value that
   * no workspace holds. The keys of the answer are the keys of the grants
   * that apply to the route.
   */
  async context(request: {
    subject: string
    tenantId: string
    workspaceId: string
    routeId: string
  }): Promise<AccessContextAnswer> {
    const body = AccessContextRequestSchema.parse({ version: 1, ...request })
    const response = await fetch(`${this.#options.url}/v1/access-context`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#options.credential}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.#options.timeoutMs ?? 5_000),
    })
    const text = await response.text()
    if (!response.ok) {
      throw new HubError(
        `the access context of Hub answered ${response.status}: ${text.slice(0, 200)}`,
        response.status
      )
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      throw new HubError('the access context of Hub answered a body that is not json', 502)
    }
    return AccessContextSchema.parse(parsed)
  }
}
