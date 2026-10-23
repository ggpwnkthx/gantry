import {
  AdminAuditSchema,
  AdminGrantSchema,
  AdminGrantsSchema,
  AdminGroupSchema,
  AdminGroupsSchema,
  AdminPrincipalSchema,
  AdminPrincipalsSchema,
  AdminTenantsSchema,
  type AdminAuditRecord,
  type AdminGrant,
  type AdminGroup,
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

  /** Reads the groups of a tenant. */
  async groups(tenant: string): Promise<AdminGroup[]> {
    const body = await this.#get(`/v1/admin/groups?tenant=${encodeURIComponent(tenant)}`)
    return AdminGroupsSchema.parse(body).groups
  }

  /** Reads the grants of a tenant. */
  async grants(tenant: string): Promise<AdminGrant[]> {
    const body = await this.#get(`/v1/admin/grants?tenant=${encodeURIComponent(tenant)}`)
    return AdminGrantsSchema.parse(body).grants
  }

  /**
   * Reads the audit of the administration.
   *
   * The export is the same endpoint with a format: `csv` and `jsonl` are
   * the files an operator hands to somebody else.
   */
  async audit(query: { tenant?: string; action?: string; limit?: number } = {}): Promise<{
    records: AdminAuditRecord[]
    total?: number
  }> {
    const parameters = new URLSearchParams()
    if (query.tenant) parameters.set('tenant', query.tenant)
    if (query.action) parameters.set('action', query.action)
    if (query.limit) parameters.set('limit', String(query.limit))
    const suffix = parameters.toString()
    const body = await this.#get(`/v1/admin/audit${suffix ? `?${suffix}` : ''}`)
    return AdminAuditSchema.parse(body)
  }

  /** The export of the audit, as the text of the file. */
  async auditExport(query: { tenant?: string; format: 'csv' | 'jsonl' }): Promise<string> {
    const parameters = new URLSearchParams()
    parameters.set('format', query.format)
    if (query.tenant) parameters.set('tenant', query.tenant)
    return await this.#text(`/v1/admin/audit?${parameters.toString()}`)
  }

  /** Registers a principal of a tenant. */
  async registerPrincipal(body: {
    tenant: string
    externalSubject: string
    email?: string
    displayName?: string
  }): Promise<AdminPrincipal> {
    return AdminPrincipalSchema.parse(await this.#write('/v1/admin/users', 'POST', body))
  }

  /** Registers a group of a tenant. */
  async registerGroup(body: {
    tenant: string
    key: string
    displayName?: string
    members?: string[]
  }): Promise<AdminGroup> {
    return AdminGroupSchema.parse(await this.#write('/v1/admin/groups', 'POST', body))
  }

  /**
   * Registers a grant.
   *
   * The `grantedBy` is the e-mail of the person who asked for the grant:
   * it is the one thing of the request that names a person and not the
   * console.
   */
  async putGrant(body: {
    tenant: string
    userId?: string
    group?: string
    permission: string
    workspaceId?: string | null
    routeId?: string | null
    expiresAt?: string | null
    grantedBy?: string
  }): Promise<AdminGrant> {
    return AdminGrantSchema.parse(await this.#write('/v1/admin/grants', 'PUT', body))
  }

  /** Revokes a grant. */
  async revokeGrant(id: string): Promise<void> {
    await this.#write(`/v1/admin/grants/${encodeURIComponent(id)}`, 'DELETE')
  }

  /** Reads one url of the administration of Hub. */
  async #get(path: string): Promise<unknown> {
    const response = await this.#call('GET', path, undefined)
    return this.#parse(response)
  }

  /** Writes one url of the administration of Hub. */
  async #write(path: string, method: string, body?: unknown): Promise<unknown> {
    const response = await this.#call(method, path, body)
    return this.#parse(response)
  }

  /** Reads the text of one url of the administration of Hub. */
  async #text(path: string): Promise<string> {
    const response = await this.#call('GET', path, undefined)
    if (!response.ok) {
      throw new HubError(
        `the administration of Hub answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
        response.status
      )
    }
    return await response.text()
  }

  /** The body of an answer of Hub, when it is json. */
  #parse(response: Response): unknown {
    if (!response.ok) {
      throw new HubError(
        `the administration of Hub answered ${response.status}: ${response.statusText}`,
        response.status
      )
    }
    return response.json() as Promise<unknown>
  }

  /** Calls the administration of Hub. */
  async #call(method: string, path: string, body?: unknown): Promise<Response> {
    return await fetch(`${this.#options.url}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.#options.credential}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.#options.timeoutMs ?? 5_000),
    })
  }
}
