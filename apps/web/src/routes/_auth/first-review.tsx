import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { FirstReviewGuide } from "@/components/FirstReviewGuide";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/_auth/first-review")({
  validateSearch: z.object({ matterId: z.string().uuid().optional().catch(undefined) }),
  component: FirstReview,
});

function FirstReview() {
  const { matterId } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <PageShell header={<PageHeader title="Your first contract review" />}>
      <FirstReviewGuide
        matterId={matterId}
        onChooseMatter={(id) =>
          void navigate({ to: "/first-review", search: { matterId: id || undefined } })
        }
      />
    </PageShell>
  );
}
