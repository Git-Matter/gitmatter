import { eq } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { userSettings } from "@workspace/db/schema";

export async function getUserJurisdiction(userId: string): Promise<string | null> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return row?.jurisdiction ?? null;
}

export async function setUserJurisdiction(userId: string, jurisdiction: string | null) {
  await db
    .insert(userSettings)
    .values({ userId, jurisdiction })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { jurisdiction, updatedAt: new Date() },
    });
}
