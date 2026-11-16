import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { AccountSettings } from "./-components/AccountSettings";
import { JurisdictionCard, ProviderKeys } from "./-components/AiSettings";
import { ConnectAgent } from "./-components/ConnectAgent";
import { DataPrivacyCard } from "./-components/DataPrivacyCard";
import { LegalResearchCard } from "./-components/LegalResearchCard";
import { OrganizationCard } from "./-components/OrganizationCard";
import { JobControls } from "./-components/JobControls";
import { z } from "zod";
import { useState, type ReactNode } from "react";
import { SettingsDrafts } from "./-components/SettingsDrafts";

const settingsTabs = ["account", "organization", "ai", "agents", "data"] as const;
type SettingsTab = (typeof settingsTabs)[number];

export const Route = createFileRoute("/_auth/settings/")({
  component: Settings,
  validateSearch: z.object({
    tab: z.enum(["account", "organization", "ai", "agents", "data"]).optional().catch(undefined),
  }),
});

function Settings() {
  const { session } = Route.useRouteContext();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab = tab ?? "account";
  const [visited, setVisited] = useState<Set<SettingsTab>>(() => new Set([activeTab]));
  // Record URL changes too, including browser Back/Forward and links from other surfaces.
  if (!visited.has(activeTab)) setVisited((previous) => new Set([...previous, activeTab]));

  const labels: Record<SettingsTab, string> = {
    account: "Account",
    organization: "Organization",
    ai: "AI & Models",
    agents: "Agents",
    data: "Data & Privacy",
  };
  const panel = (value: SettingsTab, children: ReactNode) => (
    <section
      key={value}
      aria-label={`${labels[value]} settings`}
      hidden={activeTab !== value}
      inert={activeTab !== value}
      className="min-w-0 [[hidden]]:hidden"
    >
      {visited.has(value) && children}
    </section>
  );
  return (
    <PageShell mode="fill" header={<PageHeader title="Settings" />}>
      <SettingsDrafts>
        <div className="grid min-h-0 flex-1 gap-5 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8">
          <div>
            <nav aria-label="Settings sections" className="hidden flex-col gap-1 md:flex">
              <SidebarMenu>
                {settingsTabs.map((value) => (
                  <SidebarMenuItem key={value}>
                    <SidebarMenuButton
                      render={<Link to="/settings" search={{ tab: value }} resetScroll={false} />}
                      isActive={activeTab === value}
                      aria-current={activeTab === value ? "page" : undefined}
                    >
                      <span>{labels[value]}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
            <NativeSelect
              aria-label="Settings section"
              className="w-full md:hidden"
              value={activeTab}
              onChange={(event) =>
                void navigate({
                  search: { tab: event.target.value as SettingsTab },
                  resetScroll: false,
                })
              }
            >
              {settingsTabs.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {labels[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="min-h-0 min-w-0 overflow-y-auto pe-2">
            <div className="max-w-3xl">
              {panel("account", <AccountSettings session={session} />)}
              {panel(
                "organization",
                <>
                  <OrganizationCard />
                  <JobControls />
                </>
              )}
              {panel(
                "ai",
                <>
                  <JurisdictionCard />
                  <ProviderKeys />
                  <LegalResearchCard />
                </>
              )}
              {panel("agents", <ConnectAgent />)}
              {panel("data", <DataPrivacyCard />)}
            </div>
          </div>
        </div>
      </SettingsDrafts>
    </PageShell>
  );
}
