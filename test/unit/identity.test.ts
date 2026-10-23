import { describe, expect, test } from 'bun:test'
import { importSPKI } from 'jose'
import { type UpstreamIdentity, verifyIdentity } from '../../app/server/identity'
import {
  generateKeyPair,
  type Identity,
  signIdentity,
  type SignedRequest,
} from '../helpers/signing'

/**
 * The verification of the identity of a request.
 *
 * The verifier is the copy of the reference implementation of Shuttle: the
 * tests say that the copy accepts what the reference accepts and refuses
 * what the reference refuses.
 */

const keys = generateKeyPair()
const otherKeys = generateKeyPair()

const identity: Identity = {
  subject: 'the-subject-of-the-caller',
  email: 'alice@shuttle.test',
  roles: ['gantry.status'],
}

const request: SignedRequest = {
  method: 'GET',
  path: '/',
  query: '',
  host: 'admin.example.com',
}

async function verify(options: {
  signature?: string
  headers?: Record<string, string | undefined>
  request?: SignedRequest
  publicKeyPem?: string
}) {
  const headers = {
    'x-shuttle-user': identity.subject,
    'x-shuttle-email': identity.email,
    'x-shuttle-roles': identity.roles?.join(','),
    'x-shuttle-signature': options.signature,
    ...options.headers,
  }
  return await verifyIdentity({
    request: options.request ?? request,
    headers,
    publicKey: await importSPKI(options.publicKeyPem ?? keys.publicKeyPem, 'ES256'),
  })
}

describe('the verification of the identity', () => {
  test('a valid signature of the version v5 passes', async () => {
    const signature = await signIdentity({
      privateKeyPem: keys.privateKeyPem,
      identity,
      request,
    })
    const result = await verify({ signature })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const verified: UpstreamIdentity = result.identity
    expect(verified.subject).toBe(identity.subject)
    expect(verified.email).toBe(identity.email)
    expect(verified.roles).toEqual(['gantry.status'])
    expect(result.version).toBe('v5')
  })

  test('a tampered header is refused', async () => {
    const signature = await signIdentity({
      privateKeyPem: keys.privateKeyPem,
      identity,
      request,
    })
    const result = await verify({
      signature,
      headers: { 'x-shuttle-user': 'the-subject-of-another-caller' },
    })
    expect(result.ok).toBe(false)
  })

  test('a signature of another key is refused', async () => {
    const signature = await signIdentity({
      privateKeyPem: otherKeys.privateKeyPem,
      identity,
      request,
    })
    const result = await verify({ signature })
    expect(result.ok).toBe(false)
  })

  test('a signature of the version v4 is refused', async () => {
    const signature = await signIdentity({
      privateKeyPem: keys.privateKeyPem,
      identity,
      request,
      version: 'v4',
    })
    const result = await verify({ signature })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('v4')
  })

  test('a request without a signature is refused', async () => {
    const result = await verify({})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('no signature')
  })

  test('a signature of another path is refused', async () => {
    const signature = await signIdentity({
      privateKeyPem: keys.privateKeyPem,
      identity,
      request: { ...request, path: '/another-path' },
    })
    const result = await verify({ signature })
    expect(result.ok).toBe(false)
  })

  test('a signature of another method is refused', async () => {
    const signature = await signIdentity({
      privateKeyPem: keys.privateKeyPem,
      identity,
      request: { ...request, method: 'POST' },
    })
    const result = await verify({ signature })
    expect(result.ok).toBe(false)
  })

  test('a signature of another host is refused', async () => {
    const signature = await signIdentity({
      privateKeyPem: keys.privateKeyPem,
      identity,
      request: { ...request, host: 'evil.example.com' },
    })
    const result = await verify({ signature })
    expect(result.ok).toBe(false)
  })

  test('a signature of another query string is refused', async () => {
    const signature = await signIdentity({
      privateKeyPem: keys.privateKeyPem,
      identity,
      request: { ...request, query: '?a=1' },
    })
    const result = await verify({ signature })
    expect(result.ok).toBe(false)
  })
})
