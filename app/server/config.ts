import { readFile } from 'node:fs/promises'
import { importSPKI, type KeyInput } from 'jose'
import { z } from 'zod'
import { readSecretFile } from './credentials'

/**
 * The settings of Gantry.
 *
 * The settings are read from the environment of the process, never from
 * `process.env` in the code: Vite replaces `process.env` with an empty
 * object when it builds the server, so the environment is read with
 * `env(c)` of `hono/adapter`, at the moment of the request.
 */
export interface Settings {
  /** The port the server listens on. */
  port: number
  /** The public key of the identity of Shuttle, a key of the curve P-256. */
  shuttleIdentityPublicKey: KeyInput
  /** The addresses of the replicas of the gateway. */
  shuttleReplicas: string[]
  /** The addresses of the replicas of Hub. */
  hubReplicas: string[]
  /** The token of the metrics of the gateway. */
  shuttleMetricsToken?: string
  /** The token of the metrics of Hub. */
  hubMetricsToken?: string
  /** The interval of the refresh of the islands, in milliseconds. */
  refreshMs: number
}

/** The environment of the server. */
const EnvironmentSchema = z.object({
  GANTRY_PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY_FILE: z.string().min(1).optional(),
  GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY: z.string().min(1).optional(),
  GANTRY_SHUTTLE_REPLICAS: z.string().optional(),
  GANTRY_SHUTTLE_METRICS_TOKEN_FILE: z.string().min(1).optional(),
  GANTRY_HUB_REPLICAS: z.string().optional(),
  GANTRY_HUB_METRICS_TOKEN_FILE: z.string().min(1).optional(),
  GANTRY_STATUS_REFRESH_MS: z.coerce.number().int().min(1_000).max(600_000).default(15_000),
})

/** The keys that were imported, by the PEM they come from. */
const importedKeys = new Map<string, KeyInput>()

/**
 * Reads the public key of the identity of Shuttle.
 *
 * The key is in the environment, in the file of `*_FILE` or in the value
 * itself. A PEM of a public key of the curve P-256 is imported with
 * `importSPKI`, which is the way the reference implementation of Shuttle
 * reads it.
 */
export async function readPublicKey(environment: Record<string, unknown>): Promise<KeyInput> {
  const parsed = EnvironmentSchema.parse(environment)
  const file = parsed.GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY_FILE
  const inline = parsed.GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY
  let pem: string | undefined
  if (file) {
    pem = await readFile(file, 'utf8')
  } else if (inline) {
    pem = inline
  }
  if (!pem) {
    throw new Error(
      'the public key of the identity of Shuttle is not set: ' +
        'GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY_FILE or GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY is needed'
    )
  }
  const cached = importedKeys.get(pem)
  if (cached) return cached
  const key = await importSPKI(pem, 'ES256')
  importedKeys.set(pem, key)
  return key
}

/** Reads a list of addresses of the environment. */
function addresses(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address.length > 0)
}

/**
 * Reads the settings of the server from the environment.
 */
export async function readSettings(environment: Record<string, unknown>): Promise<Settings> {
  const parsed = EnvironmentSchema.parse(environment)
  const shuttleMetricsToken = parsed.GANTRY_SHUTTLE_METRICS_TOKEN_FILE
    ? (await readSecretFile(parsed.GANTRY_SHUTTLE_METRICS_TOKEN_FILE)).trim()
    : undefined
  const hubMetricsToken = parsed.GANTRY_HUB_METRICS_TOKEN_FILE
    ? (await readSecretFile(parsed.GANTRY_HUB_METRICS_TOKEN_FILE)).trim()
    : undefined
  return {
    port: parsed.GANTRY_PORT,
    shuttleIdentityPublicKey: await readPublicKey(environment),
    shuttleReplicas: addresses(parsed.GANTRY_SHUTTLE_REPLICAS),
    hubReplicas: addresses(parsed.GANTRY_HUB_REPLICAS),
    ...(shuttleMetricsToken ? { shuttleMetricsToken } : {}),
    ...(hubMetricsToken ? { hubMetricsToken } : {}),
    refreshMs: parsed.GANTRY_STATUS_REFRESH_MS,
  }
}
