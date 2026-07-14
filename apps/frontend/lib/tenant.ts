import type { Membership } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Bir kullanıcının belirli bir şirkete erişimi olmadığında fırlatılır.
// Route'lar bunu yakalayıp 403 dönebilir.
export class TenantAccessError extends Error {
  constructor(message = "Bu şirkete erişiminiz yok.") {
    super(message);
    this.name = "TenantAccessError";
  }
}

/**
 * Multi-tenant izolasyonun kalbi: her firma-kapsamlı işlemden ÖNCE çağrılmalı.
 * Kullanıcının o şirkette bir üyeliği (Membership) yoksa TenantAccessError fırlatır.
 * Başarılıysa üyeliği (rol dahil) döner — çağıran yetki kontrolü için kullanabilir.
 */
export async function requireCompanyAccess(
  userId: string,
  companyId: string,
): Promise<Membership> {
  const membership = await prisma.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });

  if (!membership) {
    throw new TenantAccessError();
  }

  return membership;
}
