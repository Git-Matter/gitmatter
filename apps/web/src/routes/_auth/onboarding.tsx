import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/data/api";

export const Route = createFileRoute("/_auth/onboarding")({ component: Onboarding });

type Region = "eu" | "us" | "au";

const REGIONS: Array<{ id: Region; title: string; location: string; detail: string }> = [
  {
    id: "eu",
    title: "European Union",
    location: "Cloudflare R2 EU jurisdiction",
    detail: "Documents are restricted to Cloudflare's European Union jurisdiction.",
  },
  {
    id: "us",
    title: "United States",
    location: "Ohio, United States",
    detail: "Documents are stored in AWS us-east-2.",
  },
  {
    id: "au",
    title: "Australia",
    location: "Sydney, Australia",
    detail: "Documents are stored in AWS ap-southeast-2.",
  },
];

function Onboarding() {
  const [selected, setSelected] = useState<Region | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueToApp() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.setTenantStorageRegion(selected);
      window.location.href = "/assistant";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your data region");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center gap-stack py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose your document region</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your organization’s documents will stay in the selected storage jurisdiction or region.
          Changing it later requires a controlled migration.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {REGIONS.map((region) => (
          <button
            key={region.id}
            type="button"
            onClick={() => setSelected(region.id)}
            className="text-left"
            aria-pressed={selected === region.id}
          >
            <Card
              className={
                selected === region.id
                  ? "h-full border-foreground"
                  : "h-full hover:border-foreground/40"
              }
            >
              <CardHeader>
                <CardTitle className="text-base">{region.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">{region.location}</p>
                <p className="mt-2 text-xs text-muted-foreground">{region.detail}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        This controls document object storage. AI processing follows the provider and model your
        organization selects.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={continueToApp} disabled={!selected || busy} className="self-start">
        {busy ? "Saving…" : "Continue"}
      </Button>
    </div>
  );
}
