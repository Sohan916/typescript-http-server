import { db } from "../index.js";
import { chirps, Chirps } from "../schema.js";
import { asc } from "drizzle-orm";

export async function createChirp(chirp: Chirps) {
  const [result] = await db
    .insert(chirps)
    .values(chirp)
    .onConflictDoNothing()
    .returning();

  return result;
}

export async function getChirps() {
  return db.select().from(chirps).orderBy(asc(chirps.createdAt));
}
