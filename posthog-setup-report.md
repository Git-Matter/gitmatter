# PostHog post-wizard report

The wizard has completed a server-side PostHog integration for gitmatter. A shared `PostHog` singleton was created in `apps/web/src/server/posthog.ts` and imported into the Hono route handlers where key business actions take place. Twelve events are now tracked across authentication, matters, documents, the AI assistant, workflows, tabular reviews, and MCP agent connections. Error tracking was added to the global Hono error handler alongside the existing Sentry integration. User identity is set on signup via `$set` properties so person profiles are populated from the first event.

| Event name               | Description                                                                 | File                                           |
| ------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------- |
| `user signed up`         | A new user account was created and their tenant was provisioned.            | `apps/web/src/server/http/lib/auth.ts`         |
| `user logged in`         | A user successfully authenticated and a new session was created.            | `apps/web/src/server/http/lib/auth.ts`         |
| `matter created`         | A new legal matter was created by a user.                                   | `apps/web/src/server/http/routes/matters.ts`   |
| `matter closed`          | A legal matter was closed by its owner.                                     | `apps/web/src/server/http/routes/matters.ts`   |
| `client created`         | A new client record was added to the tenant directory.                      | `apps/web/src/server/http/routes/matters.ts`   |
| `document uploaded`      | A user uploaded a PDF or DOCX file to the document library.                 | `apps/web/src/server/http/routes/documents.ts` |
| `document edit resolved` | A user accepted or rejected a batch of AI-proposed tracked changes.         | `apps/web/src/server/http/routes/documents.ts` |
| `chat message sent`      | A user sent a message to the AI assistant and received a response.          | `apps/web/src/server/http/routes/chat.ts`      |
| `workflow created`       | A user created a new assistant, tabular, or playbook workflow.              | `apps/web/src/server/http/routes/workflow.ts`  |
| `playbook run`           | A user ran a playbook to generate a tabular review over selected documents. | `apps/web/src/server/http/routes/workflow.ts`  |
| `tabular review created` | A user created a new tabular AI review session.                             | `apps/web/src/server/http/routes/tabular.ts`   |
| `mcp token created`      | A user minted an MCP access token to connect an AI agent.                   | `apps/web/src/server/http/routes/tokens.ts`    |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard:** https://eu.posthog.com/project/225780/dashboard/830247
- **User signups over time:** https://eu.posthog.com/project/225780/insights/jtP2AMA5
- **Signup to matter creation funnel:** https://eu.posthog.com/project/225780/insights/LuDLw3Eb
- **AI assistant usage over time:** https://eu.posthog.com/project/225780/insights/PDFPtunu
- **Document workflow activity:** https://eu.posthog.com/project/225780/insights/HTFFQHup
- **MCP agent connections:** https://eu.posthog.com/project/225780/insights/X4QYKGTe

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `POSTHOG_API_KEY` and `POSTHOG_HOST` to `.env.example` and any bootstrap/CI scripts so collaborators know what to set.
- [ ] Confirm the returning-visitor path also calls `identify` — a handler that only identifies on fresh login can leave returning sessions on anonymous distinct IDs.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
