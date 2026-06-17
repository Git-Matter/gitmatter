import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
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
      </CardContent>
    </Card>
  );
}
