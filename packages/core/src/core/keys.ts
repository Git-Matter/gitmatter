import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { userApiKeys } from "@workspace/db/schema";
import { decrypt, encrypt } from "./crypto.js";

export async function getUserApiKey(
  userId: string,
  provider = "anthropic"
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
  if (!row) return null;
  return decrypt({ encrypted: row.encrypted, iv: row.iv, authTag: row.authTag });
}

export async function hasUserApiKey(userId: string, provider = "anthropic"): Promise<boolean> {
  const [row] = await db
    .select({ provider: userApiKeys.provider })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
  return !!row;
}

export async function saveUserApiKey(userId: string, plaintextKey: string, provider = "anthropic") {
  const enc = encrypt(plaintextKey);
  await db
    .insert(userApiKeys)
    .values({ userId, provider, ...enc })
    .onConflictDoUpdate({
      target: [userApiKeys.userId, userApiKeys.provider],
      set: { ...enc, updatedAt: new Date() },
    });
}

export async function deleteUserApiKey(userId: string, provider = "anthropic") {
  await db
    .delete(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
}
