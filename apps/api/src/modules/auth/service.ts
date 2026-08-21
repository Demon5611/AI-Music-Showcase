import { prisma } from "@ai-music/db";
import { NotFoundError } from "../../common/errors.js";
import { toUserDto } from "./mapper.js";

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return toUserDto(user);
}
