import { db } from "../index.js";
import { chirps, Chirps } from "../schema.js";

export async function createChirp(chirp: Chirps) {
  const [result] = await db
    .insert(chirps)
    .values(chirp)
    .onConflictDoNothing()
    .returning();

  return result;
}
