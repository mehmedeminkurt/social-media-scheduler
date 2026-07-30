import { MembershipRole, type Membership } from "@prisma/client";

export class RoleAccessError extends Error {
  constructor(message = "Bu işlem için yetkiniz yok.") {
    super(message);
    this.name = "RoleAccessError";
  }
}

export const ADMIN_ROLES: MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
];

export function isAdminRole(role: MembershipRole | null | undefined): boolean {
  return role === MembershipRole.OWNER || role === MembershipRole.ADMIN;
}

export function requireRole(
  membership: Membership,
  allowed: MembershipRole[],
): void {
  if (!allowed.includes(membership.role)) {
    throw new RoleAccessError();
  }
}
