import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { auditEvents, practiceProfiles, user } from "@workspace/db/schema";
import {
  practiceProfileSchema,
  type PracticeProfile,
  type PracticeProfileResponse,
} from "@workspace/contracts";

const EMPTY_PROFILE: PracticeProfile = {
  displayName: "",
  correspondenceHeader: "",
  signOff: "",
  jurisdiction: "AU",
  instructions: "",
};

export class PracticePermissionError extends Error {}

export async function getPracticeProfile(userId: string): Promise<PracticeProfileResponse> {
  const [account] = await db
    .select({ tenantId: user.tenantId, role: user.tenantRole })
    .from(user)
    .where(eq(user.id, userId));
  if (!account?.tenantId) throw new PracticePermissionError("Practice not found");
  const [row] = await db
    .select()
    .from(practiceProfiles)
    .where(eq(practiceProfiles.tenantId, account.tenantId));
  return {
    profile: row ? practiceProfileSchema.parse(rowProfile(row)) : { ...EMPTY_PROFILE },
    canEdit: account.role === "admin",
  };
}

function rowProfile(row: typeof practiceProfiles.$inferSelect): PracticeProfile {
  const { displayName, correspondenceHeader, signOff, jurisdiction, instructions } = row;
  return practiceProfileSchema.parse({
    displayName,
    correspondenceHeader,
    signOff,
    jurisdiction,
    instructions,
  });
}

export async function savePracticeProfile(userId: string, input: PracticeProfile) {
  const profile = practiceProfileSchema.parse(input);
  await db.transaction(async (tx) => {
    const [account] = await tx.select().from(user).where(eq(user.id, userId)).for("share");
    if (!account?.tenantId || account.tenantRole !== "admin")
      throw new PracticePermissionError("Only a practice administrator can update preferences");
    const tenantId = account.tenantId;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`practice-profile:${tenantId}`}))`
    );
    const [before] = await tx
      .select()
      .from(practiceProfiles)
      .where(eq(practiceProfiles.tenantId, tenantId));
    const previous = before ? rowProfile(before) : EMPTY_PROFILE;
    const changedFields = (Object.keys(profile) as Array<keyof PracticeProfile>).filter(
      (key) => previous[key] !== profile[key]
    );
    if (!changedFields.length) return;
    await tx
      .insert(practiceProfiles)
      .values({ tenantId, ...profile, updatedBy: userId })
      .onConflictDoUpdate({
        target: practiceProfiles.tenantId,
        set: { ...profile, updatedBy: userId, updatedAt: new Date() },
      });
    // Atomic with the preference write. Only field names, never letterhead or
    // correspondence content, enter the security/operations audit log.
    await tx.insert(auditEvents).values({
      eventType: "practice.profile_updated",
      actorId: userId,
      tenantId,
      target: tenantId,
      metadata: { changedFields },
    });
  });
  return getPracticeProfile(userId);
}
