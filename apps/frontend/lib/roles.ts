import type { Membership } from "@prisma/client";

import {
  ADMIN_ROLES,
  requireRole,
} from "@/lib/role-utils";
import { requireCompanyAccess } from "@/lib/tenant";

export {
  ADMIN_ROLES,
  isAdminRole,
  requireRole,
  RoleAccessError,
} from "@/lib/role-utils";

export async function requireCompanyAdminAccess(
  userId: string,
  companyId: string,
): Promise<Membership> {
  const membership = await requireCompanyAccess(userId, companyId);
  requireRole(membership, ADMIN_ROLES);
  return membership;
}
