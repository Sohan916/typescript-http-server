import { db } from "../index.js";
import { NewUser, users } from "../schema.js";
import { eq } from "drizzle-orm";

export type UserResponse = Omit<NewUser, "hashedPassword">;

export async function createUser(user: NewUser) {
  const [result] = await db
    .insert(users)
    .values(user)
    .onConflictDoNothing()
    .returning();
  return result;
}

export async function deleteAllUsers() {
  await db.delete(users);
}

export async function getUserByEmail(email: string) {
  const [result] = await db.select().from(users).where(eq(users.email, email));

  return result;
}

export async function updateUserById(userId: string, value: Partial<NewUser>) {
  const [result] = await db
    .update(users)
    .set(value)
    .where(eq(users.id, userId));
}

export async function updateChirpyToRed(id: string) {
  const [result] = await db
    .update(users)
    .set({ isChirpyRed: true })
    .where(eq(users.id, id))
    .returning();

  return result;
}
