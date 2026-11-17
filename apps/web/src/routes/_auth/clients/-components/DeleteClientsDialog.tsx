import { ConfirmDialog } from "@/components/ConfirmDialog";
export function DeleteClientsDialog({
  open,
  selectedCount,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  selectedCount: number;
  pending: boolean;
  error?: unknown;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title={`Delete ${selectedCount} client${selectedCount === 1 ? "" : "s"}?`}
      description="Only selected clients without matters can be deleted. Clients with matters are retained."
      confirmLabel="Delete clients"
      pending={pending}
      error={error}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />
  );
}
