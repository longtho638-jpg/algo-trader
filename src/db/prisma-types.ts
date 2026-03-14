/**
 * Local type definitions for Prisma models that may not be generated.
 * Use these types when @prisma/client does not export them (client not yet generated).
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum DunningStatus {
  ACTIVE = 'ACTIVE',
  GRACE_PERIOD = 'GRACE_PERIOD',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
}

// ---------------------------------------------------------------------------
// Prisma namespace helpers
// ---------------------------------------------------------------------------

/** JSON-compatible value type used in Prisma InputJsonValue */
export type InputJsonValue =
  | string
  | number
  | boolean
  | InputJsonValue[]
  | { [key: string]: InputJsonValue | undefined };

/** Generic where clause for filtering (simplifies partial where inputs) */
export interface WhereInput {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Model interfaces (match Prisma schema)
// ---------------------------------------------------------------------------

export interface License {
  id: string;
  key: string;
  tier: string;
  tenantId: string | null;
  status: string;
  expiresAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
}

export interface LicenseFeatureFlag {
  id: number;
  licenseId: string;
  featureFlagId: number;
  enabled: boolean;
  overrideValue: unknown | null;
  createdAt: Date;
}

export interface FeatureFlag {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  userWhitelist: unknown;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  licenses?: LicenseFeatureFlag[];
}

export interface ExtensionEligibility {
  id: number;
  licenseId: string;
  extensionName: string;
  eligible: boolean;
  status: string;
  usageCount: number;
  usageLimit: number;
  resetAt: Date | null;
  approvedAt: Date | null;
  deniedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  eventType: string;
  tenantId: string;
  orderId: string | null;
  userId: string;
  severity: string;
  payload: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  catOrderRef: string | null;
  catEventCategory: string | null;
  symbol: string | null;
  side: string | null;
  amount: unknown | null;
  price: unknown | null;
  prevHash: string | null;
  hash: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// LicenseWhereInput / UsageEventWhereInput helpers
// ---------------------------------------------------------------------------

export interface LicenseWhereInput {
  status?: string | { in?: string[]; not?: string };
  tier?: string | { in?: string[] };
  tenantId?: string | null;
  key?: string;
  id?: string;
  [key: string]: unknown;
}

export interface UsageEventWhereInput {
  licenseKey?: string;
  eventType?: string;
  tenantId?: string | null;
  createdAt?: {
    gte?: Date;
    lte?: Date;
    lt?: Date;
    gt?: Date;
  };
  [key: string]: unknown;
}
