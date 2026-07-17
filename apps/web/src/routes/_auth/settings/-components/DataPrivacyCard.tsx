import { useQuery } from "@tanstack/react-query";
import { Download, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/data/api";

export function DataPrivacyCard() {
  // Admin gate, mirroring OrganizationCard: listInvites 403s for non-admins.
  const { isError } = useQuery({
    queryKey: ["invites"],
    queryFn: () => api.listInvites(),
    retry: false,
  });
  const isAdmin = !isError;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data &amp; Privacy</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-stack">
        <div className="flex flex-col gap-2">
          <Label>Export</Label>
          <p className="text-sm text-muted-foreground">
            Download all of your organization's data as a zip of CSVs — clients, matters, tabular
            reviews, and a documents manifest. Document files are not included.
          </p>
          {isAdmin ? (
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                window.location.href = api.tenantDataExportUrl();
              }}
            >
              <Download className="size-4" />
              Export tenant data
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Only organization admins can export tenant data.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t pt-stack">
          <Label>Document storage evidence</Label>
          <p className="text-sm text-muted-foreground">
            Download the selected document-storage region and its audit event. Keep it with the
            corresponding Cloudflare or AWS configuration evidence when making privacy claims.
          </p>
          {isAdmin ? (
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                window.location.href = api.tenantPrivacyEvidenceUrl();
              }}
            >
              <FileCheck2 className="size-4" />
              Download privacy evidence
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Only organization admins can download privacy evidence.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
