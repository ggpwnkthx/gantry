import type { UpstreamIdentity } from './identity'
import type { HubCredentials } from './credentials'
import type { AccessContextClient } from './clients/access-context'
import type { HubAdminClient } from './clients/hub-admin'

/**
 * The scope of the operator.
 *
 * The scope answers one question: what may this caller do inside Gantry.
 * The answer is the tenant of the caller, or the platform, and the keys
 * that Hub holds for the caller on the route of Gantry.
 *
 * The scope is never taken from a header: the identity of the request is
 * verified, and the scope is read from Hub with that identity.
 */

/** The scope of an operator. */
export interface OperatorScope {
  /** The id of the principal of the caller. */
  subject: string
  /** The e-mail of the caller, when it is known. */
  email?: string
  /** The id of the tenant of the caller. */
  tenantId: string
  /** The slug of the tenant of the caller. */
  tenantSlug: string
  /** The keys that Hub holds for the caller on the route of Gantry. */
  permissionKeys: string[]
  /** True when the caller is an operator of the platform. */
  platform: boolean
}

/** The scope of an operator, and the credential that reads its tenant. */
export interface ResolvedOperator {
  /** The scope of the operator. */
  scope: OperatorScope
  /** The credential of the administration that reads the tenant of the operator. */
  credential: string
  /** The moment the answer of Hub stops being valid, in milliseconds. */
  validUntil: number
}

/**
 * Reports whether the scope of a caller holds a permission.
 */
export function hasPermission(scope: OperatorScope, permission: string): boolean {
  return scope.permissionKeys.includes(permission)
}

/** The reason why a caller has no scope. */
export class ScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScopeError'
  }
}

/** The key of the platform operator. */
export const PLATFORM_PERMISSION = 'gantry.platform'
/** The key of the operator that may look at the status. */
export const STATUS_PERMISSION = 'gantry.status'
/** The key of the operator that may change something. */
export const ADMIN_PERMISSION = 'gantry.admin'

/** The route of Gantry, the one the keys of the caller are read for. */
export const GANTRY_ROUTE = 'gantry'

/** The options of the resolution of a scope. */
export interface ResolveScopeOptions {
  /** The identity of the caller, already verified. */
  identity: UpstreamIdentity
  /** The credentials of Hub. */
  credentials: HubCredentials
  /** The client of the administration of Hub, for one credential. */
  admin: (credential: string) => HubAdminClient
  /** The client of the access context of Hub. */
  accessContext: AccessContextClient
}

/**
 * Resolves the scope of a caller.
 *
 * The steps are the ones of the plan:
 *
 * 1. the principal of the caller is read in Hub, with the credential of
 *    the platform: the tenant of the caller is not known yet,
 * 2. the keys that Hub holds for the caller on the route of Gantry are
 *    read in the access context of Hub,
 * 3. the credential of the scope is chosen: the credential of the platform
 *    for an operator of the platform, the credential of the tenant of the
 *    caller for the others. A caller whose tenant has no credential has no
 *    scope.
 */
export async function resolveOperatorScope(
  options: ResolveScopeOptions
): Promise<ResolvedOperator> {
  const { identity, credentials } = options
  const subject = identity.subject
  if (!subject) {
    throw new ScopeError('the caller has no subject')
  }
  const email = identity.email
  if (!email) {
    throw new ScopeError('the caller has no e-mail address, so its principal is unknown')
  }
  const platform = credentials.platform
  if (!platform) {
    throw new ScopeError(
      'the credential of the platform is not set, so the principal of the caller is unknown'
    )
  }

  // 1. the principal of the caller, and its tenant.
  const principals = await options.admin(platform).principals({ email })
  const principal = principals.find((candidate) => candidate.id === subject)
  if (!principal) {
    throw new ScopeError('the caller is not a principal of a tenant of the platform')
  }
  const tenantSlug = principal.tenant

  const tenants = await options.admin(platform).tenants()
  const tenant = tenants.find((candidate) => candidate.slug === tenantSlug)
  if (!tenant) {
    throw new ScopeError(`the tenant "${tenantSlug}" of the caller is unknown`)
  }

  // 2. the keys of the caller on the route of Gantry.
  if (!credentials.accessContext) {
    throw new ScopeError('the credential of the access context is not set')
  }
  const context = await options.accessContext.context({
    subject,
    tenantId: tenant.id,
    workspaceId: tenantSlug,
    routeId: GANTRY_ROUTE,
  })
  if (!context.allow || context.permissionKeys.length === 0) {
    throw new ScopeError('the caller has no permission on the route of Gantry')
  }

  const isPlatform = context.permissionKeys.includes(PLATFORM_PERMISSION)
  // The platform is not scoped to a tenant: an operator of the platform may
  // do everything an operator of a tenant may do, in every tenant. The keys
  // of the console are therefore added to the keys of the platform.
  const permissionKeys = isPlatform
    ? [...new Set([...context.permissionKeys, STATUS_PERMISSION, ADMIN_PERMISSION])].sort()
    : context.permissionKeys
  const scope: OperatorScope = {
    subject,
    email,
    tenantId: tenant.id,
    tenantSlug,
    permissionKeys,
    platform: isPlatform,
  }

  // 3. the credential of the scope.
  const credential = isPlatform ? platform : credentials.tenants.get(tenantSlug)
  if (!credential) {
    throw new ScopeError(
      `the tenant "${tenantSlug}" has no credential of the administration of Hub`
    )
  }
  // The answer of Hub carries the moment it stops being valid: a consumer
  // that keeps it longer than that keeps a permission that was revoked.
  const validUntil = context.validUntil ? Date.parse(context.validUntil) : Date.now() + 5_000
  return { scope, credential, validUntil }
}
