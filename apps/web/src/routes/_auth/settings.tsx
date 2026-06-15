import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { AccountSettings } from "./settings/-components/AccountSettings";
import { JurisdictionCard, ProviderKeys } from "./settings/-components/AiSettings";
import { ConnectAgent } from "./settings/-components/ConnectAgent";
import { OrganizationCard } from "./settings/-components/OrganizationCard";

export const Route = createFileRoute("/_auth/settings")({ component: Settings });

function Settings() {
  const { session } = Route.useRouteContext();

  return (
    <PageShell header={<PageHeader title="Settings" />}>
      <Tabs defaultValue="account" className="flex max-w-2xl flex-col gap-section">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="ai">AI &amp; Models</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
        </TabsList>
        <TabsContent value="account" className="flex flex-col gap-section">
          <AccountSettings session={session} />
        </TabsContent>
        <TabsContent value="organization">
          <OrganizationCard />
        </TabsContent>
        <TabsContent value="ai" className="flex flex-col gap-section">
          <JurisdictionCard />
          <ProviderKeys />
        </TabsContent>
        <TabsContent value="agents">
          <ConnectAgent />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
