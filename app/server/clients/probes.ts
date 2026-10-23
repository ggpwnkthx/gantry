/**
 * The probes of the replicas.
 *
 * A probe asks a replica whether it is ready to serve. The answer of a
 * probe is a fact about the replica, and the console shows it as it is:
 * a replica that is down is a row of the table of the replicas, and not a
 * missing row.
 */

/** The state of a replica. */
export type ProbeState = 'ready' | 'not-ready' | 'unreachable'

/** The answer of a probe. */
export interface Probe {
  /** The address of the replica. */
  address: string
  /** The state of the replica. */
  state: ProbeState
  /** The moment of the answer. */
  at: number
  /** The time the answer took, in milliseconds. */
  latencyMs: number
  /** The reason of the state, when there is one. */
  reason?: string
}

/** The options of a probe. */
export interface ProbeOptions {
  /** The address of the replica. */
  address: string
  /** The timeout of the probe, in milliseconds. */
  timeoutMs?: number
}

/** Probes one replica. */
export async function probeReplica(options: ProbeOptions): Promise<Probe> {
  const started = Date.now()
  try {
    const response = await fetch(`${options.address.replace(/\/$/, '')}/readyz`, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 2_000),
    })
    const latencyMs = Date.now() - started
    if (response.status === 200) {
      return { address: options.address, state: 'ready', at: Date.now(), latencyMs }
    }
    return {
      address: options.address,
      state: 'not-ready',
      at: Date.now(),
      latencyMs,
      reason: `the readiness answered ${response.status}`,
    }
  } catch {
    return {
      address: options.address,
      state: 'unreachable',
      at: Date.now(),
      latencyMs: Date.now() - started,
      reason: 'the replica is not reachable',
    }
  }
}

/** Probes every replica, at the same time. */
export async function probeReplicas(addresses: string[], timeoutMs?: number): Promise<Probe[]> {
  return await Promise.all(addresses.map((address) => probeReplica({ address, timeoutMs })))
}
