import type { VocalGender } from "@ai-music/shared";
import { prisma } from "@ai-music/db";
import { NotFoundError } from "../../common/errors.js";
import { toUserDto } from "../auth/mapper.js";

export async function updateUserVocalGender(userId: string, vocalGender: VocalGender) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { vocalGender },
  });

  return toUserDto(updated);
}
