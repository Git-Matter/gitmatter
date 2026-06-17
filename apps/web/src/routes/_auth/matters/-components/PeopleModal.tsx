import { SharePeopleDialog, matterShareSource } from "@/components/SharePeopleDialog";

// Matter "People with access" — a thin wrapper over the shared SharePeopleDialog
// (also used by documents and reviews).
export function PeopleModal({
  matterId,
  matterName,
  canManage,
  open,
  onOpenChange,
}: {
  matterId: string;
  matterName: string;
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <SharePeopleDialog
      source={matterShareSource(matterId, matterName, canManage)}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
