import {
  AdminPrincipalsSchema,
  AdminTenantsSchema,
  type AdminPrincipal,
  type AdminTenant,
} from '../schemas/hub'

/**
 * The client of the administration of Hub.
 *
 * The client is the one of a **credential**: the credential of a tenant
 * reads the principals of that tenant and nothing else, and Hub refuses
 * the calls that go beyond it. The console never holds a credential of a
 * tenant that is not the tenant of the caller.
 */

/** The options of the client. */
export interface HubAdminClientOptions {
  /** The url of Hub. */
  url: string
  /** The credential of the administration. */
  credential: string
  /** The timeout of a call, in milliseconds. */
  timeoutMs?: number
}

/** The error of a call that Hub refused or that Hub did not answer. */
export class HubError extends Error {
  /** The status of the answer of Hub. */
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HubError'
    this.status = status
  }
}

/** The client of the administration of Hub. */
export class HubAdminClient {
  readonly #options: HubAdminClientOptions

  constructor(options: HubAdminClientOptions) {
    this.#options = options
  }

  /**
   * Reads the principals of a tenant.
   *
   * The tenant is named by its slug. A call without a tenant reads the
   * principals of every tenant, and only the credential of the platform is
   * allowed to make it.
   */
  async principals(query: { tenant?: string; email?: string } = {}): Promise<AdminPrincipal[]> {
    const parameters = new URLSearchParams()
    if (query.tenant) parameters.set('tenant', query.tenant)
    if (query.email) parameters.set('email', query.email)
    if (query.tenant === undefined && query.email === undefined) {
      parameters.set('limit', '200')
    }
    const suffix = parameters.toString()
    const body = await this.#get(`/v1/admin/users${suffix ? `?${suffix}` : ''}`)
    return AdminPrincipalsSchema.parse(body).principals
  }

  /** Reads the tenants of the platform. */
  async tenants(): Promise<AdminTenant[]> {
    const body = await this.#get('/v1/admin/tenants')
    return AdminTenantsSchema.parse(body).tenants
  }

  /** Reads one url of the administration of Hub. */
  async #get(path: string): Promise<unknown> {
    const response = await fetch(`${this.#options.url}${path}`, {
      headers: {
        authorization: `Bearer ${this.#options.credential}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.#options.timeoutMs ?? 5_000),
    })
    const text = await response.text()
    if (!response.ok) {
      throw new HubError(
        `the administration of Hub answered ${response.status}: ${text.slice(0, 200)}`,
        response.status
      )
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new HubError('the administration of Hub answered a body that is not json', 502)
    }
  }
}
