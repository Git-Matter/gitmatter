import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { AccountSettings } from "./-components/AccountSettings";
import { JurisdictionCard, ProviderKeys } from "./-components/AiSettings";
import { ConnectAgent } from "./-components/ConnectAgent";
import { DataPrivacyCard } from "./-components/DataPrivacyCard";
import { LegalResearchCard } from "./-components/LegalResearchCard";
import { OrganizationCard } from "./-components/OrganizationCard";

export const Route = createFileRoute("/_auth/settings/")({ component: Settings });

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
          <TabsTrigger value="data">Data &amp; Privacy</TabsTrigger>
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
          <LegalResearchCard />
        </TabsContent>
        <TabsContent value="agents">
          <ConnectAgent />
        </TabsContent>
        <TabsContent value="data">
          <DataPrivacyCard />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
