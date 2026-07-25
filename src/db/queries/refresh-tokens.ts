import { db } from "../index.js";
import { RefreshTokens, refreshTokens } from "../schema.js";
import { eq } from "drizzle-orm";

export async function createRefreshToken(refreshToken: RefreshTokens) {
  const [result] = await db
    .insert(refreshTokens)
    .values(refreshToken)
    .onConflictDoNothing()
    .returning();

  return result;
}

export async function getUserFromRefreshToken(refreshToken: string) {
  const [result] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.token, refreshToken));

  return result;
}

export async function updateUserFromRefreshToken(
  refreshToken: string,
  value: Partial<RefreshTokens>,
) {
  const [result] = await db
    .update(refreshTokens)
    .set(value)
    .where(eq(refreshTokens.token, refreshToken));
}
