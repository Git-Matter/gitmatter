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
import { PracticeProfileCard } from "./-components/PracticeProfileCard";
import { PracticeSetup } from "./-components/PracticeSetup";

const SETTINGS_TABS = [
  "setup",
  "practice",
  "account",
  "organization",
  "ai",
  "agents",
  "data",
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

export const Route = createFileRoute("/_auth/settings/")({
  component: Settings,
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } => ({
    tab: SETTINGS_TABS.includes(search.tab as SettingsTab)
      ? (search.tab as SettingsTab)
      : undefined,
  }),
});

function Settings() {
  const { session } = Route.useRouteContext();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <PageShell header={<PageHeader title="Settings" />}>
      <Tabs
        value={tab ?? "setup"}
        onValueChange={(value) =>
          void navigate({ search: { tab: value as SettingsTab }, replace: true })
        }
        className="flex max-w-2xl flex-col gap-section"
      >
        <TabsList className="max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="setup">Get started</TabsTrigger>
          <TabsTrigger value="practice">Your practice</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="ai">AI &amp; Models</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="data">Data &amp; Privacy</TabsTrigger>
        </TabsList>
        <TabsContent value="setup">
          <PracticeSetup />
        </TabsContent>
        <TabsContent value="practice">
          <PracticeProfileCard userId={session.user.id} />
        </TabsContent>
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
