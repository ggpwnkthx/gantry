import { stat, readFile } from 'node:fs/promises'
import { z } from 'zod'

/**
 * The credentials of Hub.
 *
 * The credentials live in the environment of the server and they are read
 * from the files of the environment: they never reach the browser, a log
 * line or an error page.
 *
 * - the credential of the platform (`*`) reads every tenant, and it is the
 *   one that reads the principal of the caller before the tenant of the
 *   caller is known,
 * - the credential of a tenant reads that tenant and nothing else,
 * - the credential of the access context is a read only credential of its
 *   own.
 */

/** The map of the credentials of the administration. */
const AdminTokensSchema = z.record(z.string().min(1), z.string().min(1))

/** The credentials of Hub. */
export interface HubCredentials {
  /** The credential of the platform: it reads every tenant. */
  platform?: string
  /** The credential of a tenant, by the slug of the tenant. */
  tenants: Map<string, string>
  /** The credential of the access context. */
  accessContext?: string
}

/** The credentials that were read, by the file they come from. */
const readFiles = new Map<string, { modifiedAt: number; value: string }>()

/**
 * Reads a file of a secret, when the file changed.
 *
 * The file of a secret is read again when it changed: a rotation of a
 * credential is a new content of the file, and Gantry has to see it
 * without a restart.
 */
async function readSecretFile(path: string): Promise<string> {
  const info = await stat(path)
  const cached = readFiles.get(path)
  if (cached && cached.modifiedAt === info.mtimeMs) return cached.value
  const value = await readFile(path, 'utf8')
  readFiles.set(path, { modifiedAt: info.mtimeMs, value })
  return value
}

/**
 * Reads the credentials of Hub from the environment.
 *
 * The environment names the files of the credentials: the value of a
 * secret is in a file, and the file is named by `*_FILE`.
 */
export async function readHubCredentials(
  environment: Record<string, unknown>
): Promise<HubCredentials> {
  const credentials: HubCredentials = { tenants: new Map() }

  const adminFile = environment.GANTRY_HUB_ADMIN_TOKENS_FILE
  if (typeof adminFile === 'string' && adminFile.length > 0) {
    const parsed = AdminTokensSchema.parse(JSON.parse(await readSecretFile(adminFile)) as unknown)
    for (const [slug, token] of Object.entries(parsed)) {
      if (slug === '*') {
        credentials.platform = token
      } else {
        credentials.tenants.set(slug, token)
      }
    }
  }

  const contextFile = environment.GANTRY_HUB_ACCESS_CONTEXT_TOKEN_FILE
  if (typeof contextFile === 'string' && contextFile.length > 0) {
    credentials.accessContext = (await readSecretFile(contextFile)).trim()
  }

  return credentials
}

/** The environment of the credentials of Hub. */
export const HubCredentialsEnvironmentSchema = z.object({
  GANTRY_HUB_URL: z.string().url().optional(),
  GANTRY_HUB_ADMIN_TOKENS_FILE: z.string().min(1).optional(),
  GANTRY_HUB_ACCESS_CONTEXT_TOKEN_FILE: z.string().min(1).optional(),
})
