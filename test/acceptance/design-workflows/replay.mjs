import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const group = process.argv[2];
const cli = process.env.PLAYWRIGHT_CLI;
const groups = {
  feedback: ["feedback-interactions", "ux-nine", "ux-authoring", "app-wide"],
  "ux-nine": ["ux-nine", "ux-authoring", "app-wide"],
  "app-wide": ["app-wide"],
  "first-review": [
    "first-review",
    "first-review-states",
    "first-review-exit",
    "first-review-saving",
    "template-unsaved",
    "first-review-refresh",
  ],
  assistant: ["assistant-execution", "assistant-context"],
  access: ["settings-navigation", "settings-limits", "auth-recovery", "sign-out"],
  "template-library": ["template-lifecycle", "template-stale"],
  "review-and-output": [
    "detail-recovery",
    "review-table",
    "review-workspace",
    "review-drafts",
    "review-inspector",
    "review-states",
    "review-proposal",
    "review-output",
  ],
};
if (!groups[group] || !cli) {
  throw new Error(
    "Usage: PLAYWRIGHT_CLI=/path/to/playwright-cli node test/acceptance/design-workflows/replay.mjs feedback|ux-nine|app-wide|first-review|review-and-output|template-library|assistant|access"
  );
}
const root = resolve(import.meta.dirname, "../../..");
const fixtureUrl = `http://127.0.0.1:4280${
  group === "app-wide" || group === "ux-nine" || group === "feedback"
    ? "/clients"
    : group === "assistant"
      ? "/assistant"
      : "/"
}`;
if (!(await fetch(fixtureUrl)).ok)
  throw new Error(`Start the required local surface first: ${fixtureUrl}`);
const session = `design-${group}`;
const output = resolve(root, "output/playwright/design-workflows", `replay-${group}`);
await mkdir(output, { recursive: true });
const common = [
  "apps/web/src/components/ui/breadcrumb.tsx",
  "apps/web/src/components/ui/sheet.tsx",
  "apps/web/src/components/ui/tabs.tsx",
  "apps/web/src/components/ui/badge.tsx",
  "apps/web/src/components/PageHeader.tsx",
  "apps/web/src/components/ModelPicker.tsx",
  "apps/web/src/lib/data/api.ts",
  "apps/web/src/lib/data/snapshot-refresh.ts",
  "apps/web/src/components/SnapshotNotice.tsx",
  "apps/web/src/components/UnsavedChangesGuard.tsx",
  "test/acceptance/mvp-ui-fixture/main.tsx",
  "test/acceptance/mvp-ui-fixture/vite.config.ts",
  "design/tokens.json",
  "apps/web/src/styles/tokens.css",
];
let sources = [
  ...common,
  ...(group === "first-review"
    ? [
        "apps/web/src/components/FirstReviewGuide.tsx",
        "apps/web/src/components/ProgressiveTaskList.tsx",
        "apps/web/src/design-system/first-review-progress.ts",
        "apps/web/src/lib/data/snapshot-refresh.ts",
        "apps/web/src/components/ui/accordion.tsx",
        "apps/web/src/routes/_auth/matters/-components/ContractReviewSetup.tsx",
        "apps/web/src/routes/_auth/library/-components/TemplateEditor.tsx",
      ]
    : [
        "apps/web/src/components/DataTable.tsx",
        "apps/web/src/routes/_auth/reviews/$id.tsx",
        "apps/web/src/lib/data/configured-model.ts",
        "apps/web/src/routes/_auth/reviews/-components/ContractReviewWorkspace.tsx",
        "apps/web/src/routes/_auth/reviews/-components/ContractReviewActions.tsx",
        "apps/web/src/routes/_auth/reviews/-components/useReviewActionDrafts.ts",
        "apps/web/src/routes/_auth/reviews/-components/CellDetailDrawer.tsx",
        "apps/web/src/routes/_auth/documents/-components/DocumentDrawer.tsx",
        "apps/web/src/routes/_auth/documents/$id.tsx",
        "apps/web/src/routes/_auth/documents/-components/WordInspectionNotice.tsx",
        "apps/web/src/routes/_auth/matters/-components/AgentActivity.tsx",
        "apps/web/src/components/ConfirmDialog.tsx",
      ]),
];
if (group === "app-wide")
  sources = [
    ...common,
    ...["clients", "matters", "documents", "workflows", "library"].map(
      (name) => `apps/web/src/routes/_auth/${name}/index.tsx`
    ),
    "apps/web/src/components/DataTable.tsx",
    "apps/web/src/components/StateCue.tsx",
    "apps/web/src/components/ui/input-group.tsx",
    "apps/web/src/routes/_auth/clients/-components/clientColumns.tsx",
    "apps/web/src/routes/_auth/matters/-components/matterColumns.tsx",
    "apps/web/src/routes/_auth/documents/-components/documentColumns.tsx",
    "apps/web/src/routes/_auth/documents/-components/DocumentStatusBadge.tsx",
    "apps/web/src/routes/_auth/workflows/-components/workflowColumns.tsx",
    ...["main.tsx", "vite.config.ts", "index.html", "tsconfig.json"].map(
      (name) => `test/acceptance/app-ui-fixture/${name}`
    ),
  ];
if (group === "template-library")
  sources = [
    "design/tokens.json",
    "apps/web/src/styles/tokens.css",
    "apps/web/src/components/UnsavedChangesGuard.tsx",
    "apps/web/src/lib/data/snapshot-refresh.ts",
    ...[
      "TemplatesSection.tsx",
      "TemplateDetail.tsx",
      "TemplateEditor.tsx",
      "TemplateTeam.tsx",
      "TemplateHistory.tsx",
      "template-ui.tsx",
    ].map((file) => `apps/web/src/routes/_auth/library/-components/${file}`),
    "apps/web/src/routes/_auth/library/index.tsx",
    "apps/web/src/server/http/routes/templates.ts",
    "packages/core/src/content/templates.ts",
    "packages/contracts/src/templates.ts",
    "packages/db/src/schema/templates.ts",
    "packages/core/src/core/commit.ts",
    "packages/core/src/core/template-storage.ts",
    ...[
      "server.ts",
      "loader.mjs",
      "storage-adapter.ts",
      "package.json",
      "tsconfig.json",
      "browser/main.tsx",
      "browser/index.html",
      "browser/vite.config.ts",
    ].map((file) => `test/acceptance/template-library/harness/${file}`),
    ...[
      "manifest.json",
      "northstar-mutual-nda-v1.docx",
      "northstar-mutual-nda-v2.docx",
      "northstar-mutual-nda-v3.docx",
    ].map((file) => `test/acceptance/template-library/fixtures/${file}`),
  ];
if (group === "assistant")
  sources = [
    "apps/web/src/components/PageHeader.tsx",
    "design/tokens.json",
    "apps/web/src/styles/tokens.css",
    "apps/web/src/components/UnsavedChangesGuard.tsx",
    "apps/web/src/components/ModelPicker.tsx",
    "apps/web/src/lib/data/api.ts",
    "apps/web/src/lib/data/configured-model.ts",
    "apps/web/src/lib/data/snapshot-refresh.ts",
    "apps/web/src/lib/hooks/state/useSelectedModel.ts",
    ...[
      "index.tsx",
      "$id.tsx",
      "-components/useChatSession.ts",
      "-components/Composer.tsx",
      "-components/ChatAttachments.tsx",
      "-components/ChatTurns.tsx",
      "-components/StepsTimeline.tsx",
      "-components/ActivityPanel.tsx",
      "-components/ResponseNotice.tsx",
      "-components/SavedConversation.tsx",
    ].map((file) => `apps/web/src/routes/_auth/assistant/${file}`),
    "apps/web/src/routes/_auth/matters/-components/MatterChatWorkspace.tsx",
    "apps/web/src/routes/_auth/matters/$id/assistant/$chatId.tsx",
    "packages/core/src/platform/chat.ts",
    "apps/web/src/server/http/routes/chat.ts",
    ...["main.tsx", "auth-fixture.ts", "vite.config.ts", "tsconfig.json", "index.html"].map(
      (file) => `test/acceptance/assistant-ui-fixture/${file}`
    ),
  ];
if (group === "access")
  sources = [
    "apps/web/src/routes/sign-out.tsx",
    "apps/web/src/router.tsx",
    "design/tokens.json",
    "apps/web/src/styles/tokens.css",
    "apps/web/src/components/UnsavedChangesGuard.tsx",
    "apps/web/src/components/AppSidebar.tsx",
    "apps/web/src/components/sidebar/ChatNavPanel.tsx",
    "apps/web/src/components/ui/tabs.tsx",
    "apps/web/src/components/ui/dialog.tsx",
    "apps/web/src/components/PageHeader.tsx",
    "apps/web/src/lib/auth/auth-client.ts",
    "apps/web/src/lib/auth/redirect.ts",
    "apps/web/src/lib/context/matters-context.tsx",
    "apps/web/src/lib/data/snapshot-refresh.ts",
    "apps/web/src/lib/data/api.ts",
    ...[
      "index.tsx",
      "-components/SettingsDrafts.tsx",
      "-components/SettingsQueryNotice.tsx",
      "-components/AccountSettings.tsx",
      "-components/TwoFactorCard.tsx",
      "-components/AiSettings.tsx",
      "-components/OrganizationCard.tsx",
      "-components/JobControls.tsx",
      "-components/ConnectAgent.tsx",
      "-components/LegalResearchCard.tsx",
      "-components/DataPrivacyCard.tsx",
    ].map((file) => `apps/web/src/routes/_auth/settings/${file}`),
    ...[
      "route.tsx",
      "login.tsx",
      "signup.tsx",
      "forgot-password.tsx",
      "reset-password.tsx",
      "2fa.tsx",
      "verify-email.tsx",
      "-components/Turnstile.tsx",
      "-components/AuthShell.tsx",
    ].map((file) => `apps/web/src/routes/_unauth/${file}`),
    ...["main.tsx", "vite.config.ts", "tsconfig.json", "index.html"].map(
      (file) => `test/acceptance/account-ui-fixture/${file}`
    ),
  ];
if (group === "ux-nine" || group === "feedback") {
  const walk = async (directory) => {
    const entries = await readdir(resolve(root, directory), { withFileTypes: true });
    return (
      await Promise.all(
        entries.map((entry) =>
          entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]
        )
      )
    ).flat();
  };
  sources = [
    ...common,
    ...["CollectionPanel", "FormFeedback", "ConfirmDialog", "DataTable"].map(
      (name) => `apps/web/src/components/${name}.tsx`
    ),
    "apps/web/src/components/ActionFeedback.tsx",
    "apps/web/src/components/SharePeopleDialog.tsx",
    "apps/web/src/components/ui/button.tsx",
    "apps/web/src/components/ui/toggle.tsx",
    "apps/web/src/lib/feedback.ts",
    "apps/web/src/routes/_auth/assistant/-components/Composer.tsx",
    "apps/web/src/lib/hooks/state/useWorkspaceViewState.tsx",
    "apps/web/src/lib/hooks/useDraftExit.tsx",
    "apps/web/src/lib/hooks/table/useTablePageParams.ts",
    "apps/web/src/lib/hooks/table/useTableState.ts",
    ...(
      await Promise.all(
        ["clients", "matters", "documents", "workflows", "library", "reviews", "settings"].map(
          (name) => walk(`apps/web/src/routes/_auth/${name}`)
        )
      )
    ).flat(),
    ...(await walk("test/acceptance/app-ui-fixture")),
    "test/acceptance/design-workflows/replay.mjs",
  ];
}
sources = [
  ...new Set([
    ...sources,
    "apps/web/src/styles/globals.css",
    "apps/web/src/components/ui/card.tsx",
    "apps/web/src/components/ui/sidebar.tsx",
    "apps/web/src/hooks/use-mobile.ts",
    "apps/web/src/components/ui/native-select.tsx",
    "apps/web/src/components/ui/checkbox.tsx",
    "apps/web/src/components/ui/empty.tsx",
    "apps/web/src/components/ui/toggle-group.tsx",
    "apps/web/src/components/ToolbarTabs.tsx",
    "apps/web/src/components/TableSearch.tsx",
    "apps/web/src/components/TablePager.tsx",
    "apps/web/src/components/AppFrame.tsx",
    "apps/web/src/components/PageShell.tsx",
    "apps/web/src/lib/hooks/useMediaQuery.ts",
    "apps/web/src/components/AppSidebar.tsx",
  ]),
];
const localRun =
  group === "template-library"
    ? JSON.parse(
        await readFile(resolve(root, ".scratch/template-design-acceptance/run.json"), "utf8")
      )
    : null;
const scope =
  group === "feedback"
    ? "Current production components in one isolated fictional browser fixture on port 4280. Exercises associated input guidance, pressed state without layout shift, persistent success after confirmed intercepted responses, failure retention, navigation/dismissal focus, autosave status, reduced motion and mobile containment, alongside the nine-issue and authoring regressions. Fictional identities and API outcomes; no real authentication, credential changes, providers, server write authorization, legal quality, participant study or deployment proof. Source and script hashes identify relevant files, not the complete runtime."
    : group === "ux-nine"
      ? "Current production components for Clients, Matters, Documents, Reviews, Workflows, Library and Settings in one isolated fictional browser fixture on port 4280. Native browser history, keyboard/focus, pending/error/denied states, draft retention, explicit save retry and serialized autosave are exercised. Fictional identity/data and intercepted mutation outcomes; no real authentication, credentials, provider inference, authorization, deletion, legal quality, representative-user study or deployment proof. Native unload is suppressed only for explicit fixture resets. Source hashes identify relevant files, not a complete transitive runtime attestation."
      : group === "app-wide"
        ? "Production clients, matters, documents, workflows and Library routes in an isolated read-only browser fixture. Fictional identity and data; remote requests and mutations are blocked. Covers search/return, filter changes, checkbox selection, editor shortcut preservation, mobile sheet/focus, pagination bounds and current desktop/mobile captures. No production authentication, providers, legal quality, mutation authorization or deployment claim. Relevant source hashes are not a complete runtime attestation."
        : group === "access"
          ? "Current settings, shell, authentication components and real Better Auth browser client in an isolated memory router. Fictional session resolution and intercepted API/challenge outcomes; unhandled local API paths return 599 and remote requests are blocked. No real authentication, mail delivery, credential operations, hardware passkey, challenge verification or server authorization proof. Native unload is suppressed only during explicit fixture scenario resets; client exit guards are real. Hashes identify relevant sources, not a complete transitive runtime."
          : group === "assistant"
            ? "Production assistant and saved-conversation components in an isolated client router with fictional identity, metadata, extraction events and streamed responses. Actual provider calls are blocked. No credential operations, authentication, legal quality, server cancellation/usage settlement or production proof. Native unload prompts are suppressed only for explicit fixture resets; production client route guards are exercised. Source hashes identify relevant files, not a complete runtime bundle."
            : group === "template-library"
              ? "Current production template UI/Hono/core with real loopback Postgres, original fictional DOCX files and a tenant-scoped disk object adapter. Injected loopback personas, not production authentication, remote object storage, deployment or a legal-user study. Hashes identify relevant files, not the complete transitive runtime."
              : "Local production-component UI fixture with fictional API data. No live authentication, provider inference, template lifecycle, real Word transformation or production release proof. Native unload event prevention was signaled; no cross-browser native-prompt claim. Source hashes identify relevant modules, not a complete transitive bundle attestation. Screenshots capture settled states with finite animations disabled. The review-output download uses fixed fictional source bytes.";
const digest = async (path) =>
  createHash("sha256")
    .update(await readFile(resolve(root, path)))
    .digest("hex");
const hashes = async () =>
  Object.fromEntries(await Promise.all(sources.map(async (path) => [path, await digest(path)])));
const sourceSHA256 = await hashes();
const checks = [];

function run(args) {
  return new Promise((accept, reject) => {
    const child = spawn(cli, ["--session", session, ...args], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const deadline = setTimeout(() => child.kill("SIGTERM"), 90000);
    child.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(deadline);
      if (code !== 0 || /^### Error/m.test(stdout)) reject(new Error(stdout + stderr));
      else accept(stdout);
    });
  });
}

await run(["close"]);
await run(["open", fixtureUrl]);
for (const name of groups[group]) {
  const script = `test/acceptance/design-workflows/${name}.js`;
  const sha256 = await digest(script);
  const stdout = await run(["run-code", `--filename=${script}`]);
  await writeFile(resolve(output, `${name}.log`), stdout);
  const match = stdout.match(/^### Result\r?\n([^\r\n]+)/m);
  if (!match) throw new Error(`Missing structured result: ${script}`);
  if (sha256 !== (await digest(script))) throw new Error(`Script changed during replay: ${script}`);
  checks.push({ script, sha256, result: JSON.parse(match[1]) });
  console.log(`PASS ${name}`);
}
if (JSON.stringify(sourceSHA256) !== JSON.stringify(await hashes()))
  throw new Error("Relevant source changed during replay; evidence was not written.");
await writeFile(
  resolve(root, `design/evidence/${group}.json`),
  JSON.stringify(
    {
      version: 1,
      recordedOn: "2026-11-16",
      scope,
      ...(localRun ? { localRun: { runId: localRun.runId, tenantId: localRun.tenantId } } : {}),
      sourceSHA256,
      checks,
    },
    null,
    2
  ) + "\n"
);
console.log(`Recorded ${checks.length} checks: design/evidence/${group}.json`);
