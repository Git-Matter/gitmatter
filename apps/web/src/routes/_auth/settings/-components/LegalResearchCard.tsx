import { FieldDescription } from "@/components/ui/field";
import { notifySuccess } from "@/lib/feedback";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/data/api";
import { useSettingsDraft } from "./SettingsDrafts";
import { SettingsQueryNotice, settingsSnapshotVisible } from "./SettingsQueryNotice";

// CourtListener bring-your-own key for US case-law tools (search_case_law,
// verify_citations). Your key is encrypted at rest; without one the case-law
// tools return a prompt to add it here.
export function LegalResearchCard() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["courtlistener-key"],
    queryFn: () => api.getCourtListenerKey(),
  });
  const hasUserKey = settingsSnapshotVisible(query) && Boolean(query.data?.hasUserKey);
  const [key, setKey] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["courtlistener-key"] });

  const saveMutation = useMutation({
    mutationFn: () => api.setCourtListenerKey(key.trim()),
    onSuccess: () => {
      setKey("");
      void invalidate();
      notifySuccess("CourtListener key saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const removeMutation = useMutation({
    mutationFn: () => api.deleteCourtListenerKey(),
    onSuccess: () => {
      void invalidate();
      notifySuccess("CourtListener key removed");
    },
  });

  function save() {
    if (!key.trim()) return;
    saveMutation.mutate();
  }
  const saving = saveMutation.isPending || removeMutation.isPending;
  const busy = saving || !query.isSuccess;
  useSettingsDraft(Boolean(key), saving);

  return (
    <Card variant="section">
      <CardHeader>
        <CardTitle>Legal research</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <div className="flex items-center gap-2">
          <Label htmlFor="courtlistener-key" className="flex-1">
            CourtListener API token
          </Label>
          {!settingsSnapshotVisible(query) ? (
            <span className="text-sm text-muted-foreground">Unknown</span>
          ) : hasUserKey ? (
            <Badge variant="secondary">your key</Badge>
          ) : (
            <Badge variant="outline">not set</Badge>
          )}
        </div>
        <SettingsQueryNotice query={query} label="Legal research configuration" />
        <p className="text-xs text-muted-foreground">
          Powers US case-law search and citation checks. Get a free token from your CourtListener
          profile. Encrypted at rest.
        </p>
        {hasUserKey && (
          <p className="text-xs text-muted-foreground">
            Your token is encrypted and cannot be viewed or retrieved here. Enter a new token to
            replace it.
          </p>
        )}
        <div className="flex gap-2">
          <Input
            id="courtlistener-key"
            aria-describedby="courtlistener-key-hint"
            disabled={busy}
            autoComplete="off"
            type="password"
            placeholder={hasUserKey ? "Enter a new token to replace it" : "CourtListener API token"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <Button onClick={save} disabled={busy || !key.trim()}>
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
          {hasUserKey && (
            <Button variant="ghost" disabled={busy} onClick={() => removeMutation.mutate()}>
              {removeMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          )}
        </div>
        <FieldDescription id="courtlistener-key-hint">
          Enter a token to enable Save. Configuration must load successfully before you can change
          it.
        </FieldDescription>
      </CardContent>
    </Card>
  );
}
