import { generateKeyPairSync } from 'node:crypto'
import { CompactSign, importPKCS8 } from 'jose'

/**
 * The signing of a request, as Shuttle writes it.
 *
 * The helper is the counterpart of the verifier of `app/server/identity.ts`:
 * it builds the payload of the signature, it signs it with the private key
 * of the deployment and it writes the value of the header
 * `x-shuttle-signature`, which is `<version>=<the detached JWS>`.
 */

/** The identity of a caller. */
export interface Identity {
  subject: string
  email?: string
  roles?: string[]
  workspaceId?: string
}

/** The request that is signed. */
export interface SignedRequest {
  method: string
  path: string
  query: string
  host: string
}

/** A pair of keys of the curve P-256, in PEM. */
export interface KeyPair {
  privateKeyPem: string
  publicKeyPem: string
}

/** Generates a pair of keys of the curve P-256. */
export function generateKeyPair(): KeyPair {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return {
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}

/** The payload of the signature, in the order the fields are written. */
export function canonicalPayload(
  identity: Identity,
  request: SignedRequest,
  version: string
): string {
  return JSON.stringify({
    v: version,
    method: request.method.toUpperCase(),
    path: request.path,
    query: request.query,
    host: request.host.toLowerCase(),
    subject: identity.subject,
    workspaceId: identity.workspaceId ?? '',
    email: identity.email ?? '',
    roles: [...(identity.roles ?? [])].sort(),
  })
}

/** Signs a request and returns the value of the header of the signature. */
export async function signIdentity(options: {
  privateKeyPem: string
  identity: Identity
  request: SignedRequest
  version?: string
}): Promise<string> {
  const version = options.version ?? 'v5'
  const key = await importPKCS8(options.privateKeyPem, 'ES256')
  const payload = new TextEncoder().encode(
    canonicalPayload(options.identity, options.request, version)
  )
  const jws = await new CompactSign(payload)
    .setProtectedHeader({ alg: 'ES256', typ: 'shuttle-identity' })
    .sign(key)
  const [protectedHeader, , signature] = jws.split('.')
  return `${version}=${protectedHeader}..${signature}`
}
