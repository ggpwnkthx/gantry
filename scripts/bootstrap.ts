#!/usr/bin/env bun
/**
 * The registration of the stack of the development.
 *
 * The script does what an operator of a deployment does, in the order of
 * the runbook of Hub:
 *
 * 1. the tenant is registered,
 * 2. the principals are registered,
 * 3. the groups are registered,
 * 4. the grants are registered,
 * 5. the credentials of Gantry are written in the files that Gantry reads.
 *
 * The script is idempotent: every call of Hub is an upsert, so the script
 * may run again on a stack that is already registered.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** The configuration of the registration. */
interface BootstrapConfig {
  tenant: {
    slug: string
    displayName: string
    issuer: string
    idpClientId: string
    idpClientSecret: string
    idpRedirectUri?: string
    clientId: string
    clientSecret: string
    clientRedirectUris: string[]
  }
  principals: Array<{
    tenant: string
    externalSubject: string
    email?: string
    displayName?: string
  }>
  groups: Array<{
    tenant: string
    key: string
    displayName?: string
    members: string[]
  }>
  grants: Array<{
    tenant: string
    group: string
    permission: string
    routeId?: string
    workspaceId?: string
  }>
}

/** The environment of the script. */
const environment = process.env
const hubUrl = environment.GANTRY_BOOTSTRAP_HUB_URL ?? 'http://127.0.0.1:8081'
const adminToken = environment.GANTRY_BOOTSTRAP_ADMIN_TOKEN ?? ''
const platformCredential = environment.GANTRY_BOOTSTRAP_PLATFORM_CREDENTIAL ?? adminToken
const tenantCredential = environment.GANTRY_BOOTSTRAP_TENANT_CREDENTIAL ?? ''
const accessContextCredential = environment.GANTRY_BOOTSTRAP_ACCESS_CONTEXT_CREDENTIAL ?? ''
const output = environment.GANTRY_BOOTSTRAP_OUTPUT ?? join(process.cwd(), '.deps', 'keys')
const configurationFile =
  environment.GANTRY_BOOTSTRAP_CONFIG ?? join(process.cwd(), 'deploy', 'bootstrap.json')

/** Calls the administration of Hub. */
async function admin(
  path: string,
  method: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const response = await fetch(`${hubUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`the administration of Hub answered ${response.status}: ${text}`)
  }
  return text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {}
}

const config = JSON.parse(await readFile(configurationFile, 'utf8')) as BootstrapConfig

// 1. the tenant.
await admin('/v1/admin/tenants', 'POST', config.tenant)
console.log(`the tenant "${config.tenant.slug}" is registered`)

// 2. the principals.
for (const principal of config.principals) {
  await admin('/v1/admin/users', 'POST', principal)
  console.log(`the principal "${principal.email ?? principal.externalSubject}" is registered`)
}

// 3. the groups.
for (const group of config.groups) {
  await admin('/v1/admin/groups', 'POST', group)
  console.log(`the group "${group.key}" is registered`)
}

// 4. the grants.
for (const grant of config.grants) {
  await admin('/v1/admin/grants', 'PUT', grant)
  console.log(`the grant "${grant.permission}" of the group "${grant.group}" is registered`)
}

// 5. the credentials of Gantry.
await mkdir(output, { recursive: true })
const adminTokens = join(output, 'hub-admin-tokens.json')
await writeFile(
  adminTokens,
  `${JSON.stringify({ '*': platformCredential, [config.tenant.slug]: tenantCredential }, null, 2)}\n`
)
const accessContext = join(output, 'hub-access-context-token')
await writeFile(accessContext, accessContextCredential)
console.log(`the credentials of Gantry are written in ${output}`)

// 6. the key of the identity of the requests.
//
// The key is the key of the deployment: Shuttle signs the identity of the
// requests it forwards with the private half, and Gantry verifies it with
// the public half. The key is generated once and it is kept in the volume
// of the stack: a key that changes at every run invalidates the pages that
// are open.
const privateKeyFile = join(output, 'identity-private.pem')
const publicKeyFile = join(output, 'identity-public.pem')
if (!existsSync(privateKeyFile)) {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  await writeFile(privateKeyFile, privatePem)
  const publicPem = createPublicKey(createPrivateKey(privatePem))
    .export({ type: 'spki', format: 'pem' })
    .toString()
  await writeFile(publicKeyFile, publicPem)
  console.log('the key of the identity is generated')
} else {
  console.log('the key of the identity is kept')
}
