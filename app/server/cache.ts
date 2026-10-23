import type { ResolvedOperator } from './operator'

/**
 * The cache of the scope of the operators.
 *
 * The answer of Hub is valid for a short while, and the answer says when
 * it stops being valid: the cache keeps the scope no longer than that.
 * A revocation of a grant is therefore seen in at most five seconds.
 */

/** An entry of the cache. */
interface Entry {
  operator: ResolvedOperator
  validUntil: number
}

/** The cache of the scope of the operators. */
export class ScopeCache {
  readonly #entries = new Map<string, Entry>()

  /** Reads the scope of a caller, when the answer of Hub is still valid. */
  get(subject: string): ResolvedOperator | undefined {
    const entry = this.#entries.get(subject)
    if (!entry) return undefined
    if (entry.validUntil <= Date.now()) {
      this.#entries.delete(subject)
      return undefined
    }
    return entry.operator
  }

  /** Keeps the scope of a caller, until the moment Hub says. */
  set(subject: string, operator: ResolvedOperator, validUntil: number): void {
    this.#entries.set(subject, { operator, validUntil })
  }

  /** Forgets the scope of a caller. */
  forget(subject: string): void {
    this.#entries.delete(subject)
  }

  /** Forgets every scope. */
  clear(): void {
    this.#entries.clear()
  }

  /** The number of the scopes that are kept. */
  get size(): number {
    return this.#entries.size
  }
}

/** The cache of the process. */
export const scopeCache = new ScopeCache()
