import { type HubCredentials, readHubCredentials, readSecretFile } from './credentials'
import { AccessContextClient } from './clients/access-context'
import { HubAdminClient } from './clients/hub-admin'
import { type ControlTokens, ShuttleControlClient } from './clients/shuttle-control'

/**
 * The clients of Hub.
 *
 * The url of Hub and the credentials of Hub are read from the environment
 * of the process, and the clients are built once: a client holds no state
 * but its credential.
 */

/** The clients of Hub. */
export interface Hub {
  /** The url of Hub. */
  url: string
  /** The credentials of Hub. */
  credentials: HubCredentials
  /** The client of the administration, for one credential. */
  admin: (credential: string) => HubAdminClient
  /** The client of the access context, with the credential of the moment. */
  accessContext: () => AccessContextClient
  /** The client of the control plane of Shuttle, with the tokens of the moment. */
  control: () => ShuttleControlClient
}

/** The clients that were built, by the url of Hub. */
const clients = new Map<string, Hub>()

/**
 * Reads the clients of Hub from the environment.
 *
 * The credentials are read from the files of the environment, and a file
 * that changed is read again: a rotation of a credential does not need a
 * restart of Gantry.
 */
/**
 * Reads the tokens of the control plane, when the file of them is named.
 *
 * A file that is named and that is not there is **not** an error: the
 * control plane is optional, and a console without it still shows the
 * status of the platform and still administers the tenants of Hub. The
 * page of the operations says that the control plane is not there.
 */
async function readControlTokensFile(
  environment: Record<string, unknown>
): Promise<ControlTokens | undefined> {
  const file = environment.GANTRY_SHUTTLE_CONTROL_TOKENS_FILE
  if (typeof file !== 'string' || file.length === 0) return undefined
  const { readControlTokens } = await import('./clients/shuttle-control')
  try {
    return readControlTokens(await readSecretFile(file))
  } catch {
    return undefined
  }
}

export async function readHub(environment: Record<string, unknown>): Promise<Hub> {
  const url = typeof environment.GANTRY_HUB_URL === 'string' ? environment.GANTRY_HUB_URL : ''
  const credentials = await readHubCredentials(environment)
  const controlUrl =
    typeof environment.GANTRY_SHUTTLE_CONTROL_URL === 'string'
      ? environment.GANTRY_SHUTTLE_CONTROL_URL
      : ''
  const controlTokens = (await readControlTokensFile(environment)) ?? {}
  const cached = clients.get(url)
  if (cached) {
    cached.credentials = credentials
    return cached
  }
  const hub: Hub = {
    url,
    credentials,
    admin: (credential: string) => new HubAdminClient({ url, credential }),
    accessContext: () =>
      new AccessContextClient({ url, credential: credentials.accessContext ?? '' }),
    control: () => new ShuttleControlClient({ url: controlUrl, tokens: controlTokens }),
  }
  clients.set(url, hub)
  return hub
}
