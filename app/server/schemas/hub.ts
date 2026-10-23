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
/** The type of the answer of the access context. */
export type AccessContextAnswer = z.infer<typeof AccessContextSchema>
