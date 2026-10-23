import { z } from 'zod'

/**
 * The shapes of the answers of Hub.
 *
 * Every answer of Hub is parsed before it is used: a console that reads a
 * field that Hub does not send reads `undefined`, and `undefined` is the
 * beginning of a decision that is taken on nothing.
 */

/** A principal of a tenant, as the administration of Hub returns it. */
export const AdminPrincipalSchema = z.object({
  id: z.string().min(1),
  tenant: z.string().min(1),
  externalSubject: z.string(),
  email: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  status: z.string(),
  lastLoginAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
})

/** The list of the principals of the administration of Hub. */
export const AdminPrincipalsSchema = z.object({
  principals: z.array(AdminPrincipalSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
})

/** A tenant, as the administration of Hub returns it. */
export const AdminTenantSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  displayName: z.string(),
  issuer: z.string(),
  clientId: z.string(),
  autoProvision: z.boolean().optional(),
  sharedClient: z.boolean().optional(),
  default: z.boolean().optional(),
  enabled: z.boolean().optional(),
  userCount: z.number().optional(),
  grantCount: z.number().optional(),
  createdAt: z.string().optional(),
})

/** The list of the tenants of the administration of Hub. */
export const AdminTenantsSchema = z.object({
  tenants: z.array(AdminTenantSchema),
})

/** A group of a tenant, as the administration of Hub returns it. */
export const AdminGroupSchema = z.object({
  id: z.string().min(1),
  tenant: z.string().min(1),
  key: z.string().min(1),
  displayName: z.string().nullable().optional(),
  members: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
})

/** The list of the groups of the administration of Hub. */
export const AdminGroupsSchema = z.object({
  groups: z.array(AdminGroupSchema),
})

/** A grant, as the administration of Hub returns it. */
export const AdminGrantSchema = z.object({
  id: z.string().min(1),
  tenant: z.string().min(1),
  permission: z.string().min(1),
  userId: z.string().nullable().optional(),
  group: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  routeId: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  grantedBy: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
})

/** The list of the grants of the administration of Hub. */
export const AdminGrantsSchema = z.object({
  grants: z.array(AdminGrantSchema),
  total: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
})

/** A row of the audit of the administration of Hub. */
export const AdminAuditRecordSchema = z.object({
  id: z.string().min(1),
  at: z.string(),
  action: z.string(),
  targetId: z.string().nullable().optional(),
  tenant: z.string().nullable().optional(),
  operator: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  requestId: z.string().nullable().optional(),
})

/** The page of the audit of the administration of Hub. */
export const AdminAuditSchema = z.object({
  records: z.array(AdminAuditRecordSchema),
  total: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
})

/** The answer of the access context of Hub. */
export const AccessContextSchema = z.object({
  version: z.number(),
  allow: z.boolean(),
  subject: z.string(),
  tenantId: z.string(),
  workspaceId: z.string(),
  routeId: z.string(),
  permissionKeys: z.array(z.string()),
  evaluatedAt: z.string(),
  validUntil: z.string().nullable().optional(),
})

/** The type of a principal. */
export type AdminPrincipal = z.infer<typeof AdminPrincipalSchema>
/** The type of a tenant. */
export type AdminTenant = z.infer<typeof AdminTenantSchema>
/** The type of a group. */
export type AdminGroup = z.infer<typeof AdminGroupSchema>
/** The type of a grant. */
export type AdminGrant = z.infer<typeof AdminGrantSchema>
/** The type of a row of the audit of Hub. */
export type AdminAuditRecord = z.infer<typeof AdminAuditRecordSchema>
/** The type of the answer of the access context. */
export type AccessContextAnswer = z.infer<typeof AccessContextSchema>
