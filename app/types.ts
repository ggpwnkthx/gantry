/**
 * The shapes that the server and the browser share.
 *
 * The file holds types and nothing else: it is erased when the code is
 * compiled, and it is the contract between the server, which reads the
 * status of a service, and the island, which shows it.
 */

/** A tile of a status. */
export interface Tile {
  /** The name of the tile. */
  label: string
  /** The value of the tile. */
  value: number
  /** The unit of the value. */
  unit: 'count' | 'seconds'
  /** The state of the tile, when it has one. */
  state?: 'ok' | 'warn' | 'error'
}

/** A panel that a service does not carry yet. */
export interface PendingPanel {
  /** The name of the panel. */
  label: string
  /** The service and the version that carry the panel. */
  needs: string
  /** What the panel shows when it is there. */
  description: string
}

/** A breakdown of a status: the numbers by a key. */
export interface Breakdown {
  /** The name of the breakdown. */
  label: string
  /** The rows of the breakdown. */
  rows: Array<{ key: string; value: number; unit?: 'count' | 'seconds' }>
}

/** The state of a replica of a service. */
export interface ReplicaState {
  /** The address of the replica. */
  address: string
  /** The state of the replica. */
  state: 'ready' | 'not-ready' | 'unreachable'
  /** The moment of the answer. */
  at: number
  /** The time the answer took, in milliseconds. */
  latencyMs: number
  /** The reason of the state, when there is one. */
  reason?: string
}

/** The status of a service. */
export interface ServiceStatus {
  /** The name of the service. */
  service: 'shuttle' | 'hub'
  /** The moment of the answer. */
  at: number
  /** The state of the replicas of the service. */
  replicas: ReplicaState[]
  /** The numbers of the service. */
  tiles: Tile[]
  /** The panels that the service does not carry yet. */
  pending: PendingPanel[]
  /** The breakdowns of the numbers, by a key. */
  breakdowns: Breakdown[]
  /** The source of the numbers: the replicas that answered. */
  source: { ok: boolean; replicas: number; reason?: string }
}
