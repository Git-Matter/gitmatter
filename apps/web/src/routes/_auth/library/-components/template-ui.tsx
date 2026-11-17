import { useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/data/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { TemplateView } from "@workspace/contracts";

export const templateQueryKey = ["templates"];

export function isTemplateConflict(error: unknown) {
  return error instanceof ApiError && error.status === 409;
}

export async function refreshTemplateQueries(client: QueryClient, id: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: templateQueryKey }),
    client.invalidateQueries({ queryKey: ["template-detail", id] }),
  ]);
}

export function templateStatus(item: { status: TemplateView["status"]; current: unknown }) {
  if (item.status === "review") return "Needs review";
  if (item.status === "archived") return "Archived";
  if (item.status === "changes_requested") return "Changes requested";
  if (item.status === "published") return "Current approved";
  return item.current ? "New working revision" : "Draft";
}

export function formatBytes(size: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(size / 1024) + " KB";
}

export function TemplateDownload({
  id,
  revisionId,
  version,
  approved = true,
}: {
  id: string;
  revisionId: string;
  version: number;
  approved?: boolean;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const { blob, filename } = await api.downloadTemplate(id, revisionId);
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Download failed");
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
      {pending ? "Preparing…" : `Download ${approved ? "approved" : "working"} v${version}`}
    </Button>
  );
}
