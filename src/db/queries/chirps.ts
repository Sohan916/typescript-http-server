import { db } from "../index.js";
import { chirps, Chirps } from "../schema.js";
import { asc, eq } from "drizzle-orm";

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

export async function getChirp(id: string) {
  const rows = await db.select().from(chirps).where(eq(chirps.id, id));
  if (rows.length === 0) {
    return;
  }
  return rows[0];
}
