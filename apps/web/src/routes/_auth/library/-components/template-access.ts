import type { TemplateView } from "@workspace/contracts";

export type TemplateAccess = Pick<
  TemplateView,
  "canManage" | "canEdit" | "canReview" | "canPublish" | "canManageMembers"
>;

/** A frozen revision may survive edits, but never a successful loss of private access. */
export function templateSnapshotAccess(
  opened: TemplateView,
  latestDetail: TemplateView,
  latestSummary?: TemplateAccess
): TemplateAccess & { privateViewRevoked: boolean } {
  const privateViewRevoked =
    opened.canManage &&
    (!latestDetail.canManage ||
      latestSummary?.canManage === false ||
      (opened.draft !== null && latestDetail.draft === null));
  const retainedCapability = (key: keyof TemplateAccess) =>
    !privateViewRevoked && opened[key] && latestDetail[key] && latestSummary?.[key] !== false;
  return {
    privateViewRevoked,
    canManage: retainedCapability("canManage"),
    canEdit: retainedCapability("canEdit"),
    canReview: retainedCapability("canReview"),
    canPublish: retainedCapability("canPublish"),
    canManageMembers: retainedCapability("canManageMembers"),
  };
}
