import { z } from 'zod'

/**
 * The client of the control plane of Shuttle.
 *
 * The control plane is the only way to write the state of a deployment:
 * the sessions, the cached decisions and the route table. The console
 * holds **two** tokens of it, and the scopes do not nest:
 *
 * - the token of the scope `operate` revokes the sessions and purges the
 *   cached decisions, and it reads,
 * - the token of the scope `config` writes the route table, and it reads.
 *
 * The token of the scope `config` is used for one thing only: the rollback
 * of the route table. And it is used by the operators of the platform only.
 */

/** The scope of a token of the control plane. */
export type ControlScope = 'read' | 'operate' | 'config'

/** The tokens of the control plane. */
export interface ControlTokens {
  /** The token that revokes the sessions and purges the decisions. */
  operate?: string
  /** The token that writes the route table. */
  config?: string
}

/** The map of the tokens of the control plane, as the file holds it. */
const TokensSchema = z.record(
  z.string().min(1),
  z.object({
    operator: z.string().min(1),
    scope: z.enum(['read', 'operate', 'config']),
  })
)

/** The error of a call that the control plane refused. */
export class ControlError extends Error {
  /** The status of the answer of the control plane. */
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ControlError'
    this.status = status
  }
}

/** The active route table of the deployment. */
export const ActiveConfigSchema = z.object({
  revision: z.number(),
  table: z.unknown().nullable(),
  author: z.string().nullable().optional(),
  createdAt: z.number().nullable().optional(),
  source: z.string().optional(),
  warnings: z.array(z.unknown()).optional(),
})

/** A revision of the route table. */
export const ConfigRevisionSchema = z.object({
  revision: z.number(),
  author: z.string().nullable().optional(),
  createdAt: z.number().nullable().optional(),
  table: z.unknown().nullable().optional(),
})

/** The page of the history of the route table. */
export const ConfigHistorySchema = z.object({
  entries: z.array(ConfigRevisionSchema),
  total: z.number().optional(),
})

/** The answer of the validation of a route table. */
export const ConfigValidationSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.unknown()).optional(),
  warnings: z.array(z.unknown()).optional(),
  conflicts: z.array(z.unknown()).optional(),
})

/** The options of the client. */
export interface ShuttleControlClientOptions {
  /** The url of the control plane. */
  url: string
  /** The tokens of the control plane. */
  tokens: ControlTokens
  /** The timeout of a call, in milliseconds. */
  timeoutMs?: number
}

/** The client of the control plane of Shuttle. */
export class ShuttleControlClient {
  readonly #options: ShuttleControlClientOptions

  constructor(options: ShuttleControlClientOptions) {
    this.#options = options
  }

  /** Reads the active route table. */
  async activeConfig(): Promise<z.infer<typeof ActiveConfigSchema>> {
    return ActiveConfigSchema.parse(await this.#call('GET', '/v1/config', undefined, 'read'))
  }

  /** Reads the history of the route table. */
  async history(): Promise<z.infer<typeof ConfigHistorySchema>> {
    return ConfigHistorySchema.parse(
      await this.#call('GET', '/v1/config/history', undefined, 'read')
    )
  }

  /** Validates a route table, without writing it. */
  async validate(table: unknown): Promise<z.infer<typeof ConfigValidationSchema>> {
    return ConfigValidationSchema.parse(
      await this.#call('POST', '/v1/config/validate', table, 'read')
    )
  }

  /** Writes the route table of the deployment. */
  async writeConfig(table: unknown, expectedRevision: number): Promise<{ revision: number }> {
    const body = await this.#call('PUT', '/v1/config', table, 'config', expectedRevision)
    return { revision: Number((body as { revision?: number }).revision ?? 0) }
  }

  /**
   * Rolls the route table back to a revision.
   *
   * The revision that is replaced is in the `if-match` header: the
   * control plane refuses a rollback that would overwrite a change that it
   * does not know.
   */
  async rollback(revision: number, expectedRevision: number): Promise<{ revision: number }> {
    const body = await this.#call(
      'POST',
      '/v1/config/rollback',
      { revision },
      'config',
      expectedRevision
    )
    return { revision: Number((body as { revision?: number }).revision ?? 0) }
  }

  /** Reads the replicas of the deployment. */
  async replicas(): Promise<unknown[]> {
    const body = await this.#call('GET', '/v1/replicas', undefined, 'read')
    return Array.isArray(body) ? body : []
  }

  /** Reads the trail of the writes of the control plane. */
  async audit(): Promise<unknown[]> {
    const body = await this.#call('GET', '/v1/audit', undefined, 'read')
    return Array.isArray(body) ? body : []
  }

  /** Revokes the sessions of a subject. */
  async revokeSessions(subject: string): Promise<{ revoked: number }> {
    const body = await this.#call(
      'DELETE',
      `/v1/sessions?subject=${encodeURIComponent(subject)}`,
      undefined,
      'operate'
    )
    return { revoked: Number((body as { revoked?: number }).revoked ?? 0) }
  }

  /** Purges the cached decisions of a subject or of a workspace. */
  async purgeDecisions(subject?: string, workspace?: string): Promise<{ purged: number }> {
    const parameters = new URLSearchParams()
    if (subject) parameters.set('subject', subject)
    if (workspace) parameters.set('workspace', workspace)
    const body = await this.#call(
      'DELETE',
      `/v1/decisions?${parameters.toString()}`,
      undefined,
      'operate'
    )
    return { purged: Number((body as { purged?: number }).purged ?? 0) }
  }

  /** The token of a scope, or the reason there is none. */
  #tokenOf(scope: 'read' | 'operate' | 'config'): string {
    const token = scope === 'config' ? this.#options.tokens.config : this.#options.tokens.operate
    if (!token) {
      throw new ControlError(
        `the token of the scope "${scope}" of the control plane is not set`,
        500
      )
    }
    return token
  }

  /** Calls the control plane. */
  async #call(
    method: string,
    path: string,
    body: unknown,
    scope: 'read' | 'operate' | 'config',
    expectedRevision?: number
  ): Promise<unknown> {
    const token = this.#tokenOf(scope)
    let response: Response
    try {
      response = await fetch(`${this.#options.url}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(expectedRevision === undefined ? {} : { 'if-match': String(expectedRevision) }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.#options.timeoutMs ?? 5_000),
      })
    } catch (error) {
      throw new ControlError(`the control plane of Shuttle is not reachable: ${String(error)}`, 503)
    }
    const text = await response.text()
    if (!response.ok) {
      throw new ControlError(
        `the control plane of Shuttle answered ${response.status}: ${text.slice(0, 200)}`,
        response.status
      )
    }
    if (text.length === 0) return {}
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  }
}

/**
 * Reads the tokens of the control plane from the map of the file.
 *
 * The file of the control plane holds `{token: {operator, scope}}`, and
 * the console keeps one token of the scope `operate` and one token of the
 * scope `config`.
 */
export function readControlTokens(raw: string): ControlTokens {
  const parsed = TokensSchema.parse(JSON.parse(raw) as unknown)
  const tokens: ControlTokens = {}
  for (const [token, value] of Object.entries(parsed)) {
    if (value.scope === 'config') {
      tokens.config = token
    } else if (value.scope === 'operate') {
      tokens.operate = token
    }
  }
  return tokens
}
