import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { SignJWT, exportJWK } from 'jose'

/**
 * The provider of the identity of the development stack.
 *
 * Hub is the broker of the identity: it authenticates a caller against the
 * provider of a tenant. The development stack has no tenant in the world,
 * so it needs a provider: a small OpenID Connect provider that publishes a
 * discovery document, signs the id tokens and exchanges the codes.
 *
 * The provider is a fixture: it is the fixture of the tests of the stack and
 * it never leaves the machine of the developer.
 */

/** A key of the provider. */
interface FixtureKey {
  kid: string
  privateKey: string
}

/** The provider of the development stack. */
export interface ProviderFixture {
  /** The url of the provider. */
  url: string
  /** The issuer of the provider. */
  issuer: string
  /** The client id of Hub at the provider. */
  clientId: string
  /** The client secret of Hub at the provider. */
  clientSecret: string
  /** The subject of the caller. */
  subject: string
  /** The e-mail of the caller. */
  email: string
  /** Stops the provider. */
  stop: () => Promise<void>
}

/** Starts the provider of the development stack. */
export async function startProviderFixture(): Promise<ProviderFixture> {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  const key: FixtureKey = { kid: 'gantry-fixture-1', privateKey: pair.privateKey }
  const clientId = 'hub-gantry'
  const clientSecret = 'the-secret-of-the-provider-of-the-stack'
  const subject = 'the-subject-of-the-caller'
  const email = 'alice@gantry.test'

  /** The codes of the provider: the nonce of the login travels with them. */
  const codes = new Map<string, { nonce: string; challenge: string; redirectUri: string }>()

  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      const url = new URL(request.url)

      if (url.pathname === '/.well-known/openid-configuration') {
        return Response.json({
          issuer: url.origin,
          authorization_endpoint: `${url.origin}/authorize`,
          token_endpoint: `${url.origin}/token`,
          jwks_uri: `${url.origin}/jwks`,
          response_types_supported: ['code'],
          id_token_signing_alg_values_supported: ['RS256'],
        })
      }

      if (url.pathname === '/jwks') {
        const publicKey = createPublicKey(createPrivateKey(key.privateKey))
        const jwk = await exportJWK(publicKey)
        return Response.json({ keys: [{ ...jwk, kid: key.kid, alg: 'RS256', use: 'sig' }] })
      }

      if (url.pathname === '/authorize') {
        const redirectUri = url.searchParams.get('redirect_uri') ?? ''
        const state = url.searchParams.get('state') ?? ''
        const nonce = url.searchParams.get('nonce') ?? ''
        const challenge = url.searchParams.get('code_challenge') ?? ''
        const code = crypto.randomUUID()
        codes.set(code, { nonce, challenge, redirectUri })
        const location = new URL(redirectUri)
        location.searchParams.set('code', code)
        location.searchParams.set('state', state)
        return new Response(null, { status: 302, headers: { location: location.toString() } })
      }

      if (url.pathname === '/token') {
        const body = await request.formData()
        const code = String(body.get('code') ?? '')
        const verifier = String(body.get('code_verifier') ?? '')
        const redirectUri = String(body.get('redirect_uri') ?? '')
        const record = codes.get(code)
        codes.delete(code)
        if (!record || record.redirectUri !== redirectUri) {
          return Response.json({ error: 'invalid_grant' }, { status: 400 })
        }
        if (record.challenge) {
          const challenge = new Bun.CryptoHasher('sha256').update(verifier).digest('base64url')
          if (challenge !== record.challenge) {
            return Response.json({ error: 'invalid_grant' }, { status: 400 })
          }
        }
        const idToken = await new SignJWT({
          sub: subject,
          iss: url.origin,
          aud: clientId,
          nonce: record.nonce,
          email,
          name: 'Alice',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
        })
          .setProtectedHeader({ alg: 'RS256', kid: key.kid })
          .sign(createPrivateKey(key.privateKey))
        return Response.json({
          access_token: 'the-access-token-of-the-provider',
          token_type: 'Bearer',
          expires_in: 300,
          id_token: idToken,
        })
      }

      return new Response('not found', { status: 404 })
    },
  })

  return {
    url: `http://127.0.0.1:${server.port}`,
    issuer: `http://127.0.0.1:${server.port}`,
    clientId,
    clientSecret,
    subject,
    email,
    stop: async () => {
      await server.stop(true)
    },
  }
}
