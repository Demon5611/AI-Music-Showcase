import type { User as UserDto } from "@ai-music/shared";
import type { User } from "@ai-music/db";

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    vocalGender: user.vocalGender === "m" || user.vocalGender === "f" ? user.vocalGender : null,
    accountDeletionStatus: user.accountDeletionStatus ?? "active",
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
