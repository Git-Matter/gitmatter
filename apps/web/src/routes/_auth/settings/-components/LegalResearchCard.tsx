import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/data/api";

// CourtListener bring-your-own key for US case-law tools (search_case_law,
// verify_citations). Your key is encrypted at rest; without one the case-law
// tools return a prompt to add it here.
export function LegalResearchCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["courtlistener-key"],
    queryFn: () => api.getCourtListenerKey(),
  });
  const hasUserKey = data?.hasUserKey ?? false;
  const [key, setKey] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["courtlistener-key"] });

  const saveMutation = useMutation({
    mutationFn: () => api.setCourtListenerKey(key.trim()),
    onSuccess: () => {
      setKey("");
      void invalidate();
      toast.success("CourtListener key saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const removeMutation = useMutation({
    mutationFn: () => api.deleteCourtListenerKey(),
    onSuccess: () => {
      void invalidate();
      toast.success("CourtListener key removed");
    },
  });

  function save() {
    if (!key.trim()) return;
    saveMutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Legal research</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <div className="flex items-center gap-2">
          <Label className="flex-1">CourtListener API token</Label>
          {hasUserKey ? (
            <Badge variant="secondary">your key</Badge>
          ) : (
            <Badge variant="outline">not set</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Powers US case-law search and citation checks. Get a free token from your CourtListener
          profile. Encrypted at rest.
        </p>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="CourtListener API token"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <Button onClick={save} disabled={saveMutation.isPending || !key.trim()}>
            Save
          </Button>
          {hasUserKey && (
            <Button variant="ghost" onClick={() => removeMutation.mutate()}>
              Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
