import type { Post } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/tenant";

export class PostNotFoundError extends Error {
  constructor(message = "Gönderi bulunamadı.") {
    super(message);
    this.name = "PostNotFoundError";
  }
}

export async function requirePostForCompany(
  userId: string,
  companyId: string,
  postId: string,
): Promise<Post> {
  await requireCompanyAccess(userId, companyId);

  const post = await prisma.post.findFirst({
    where: { id: postId, companyId },
  });

  if (!post) {
    throw new PostNotFoundError();
  }

  return post;
}
