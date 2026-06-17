# AI Data Handling

Law-firm documents are privileged. This page describes which content leaves
gitcounsel, where it goes, and how to configure the most retention-averse posture
each provider allows. Verify provider policies before relying on them — they move.

## What gets sent to a provider

When you run a chat turn or a tabular review, gitcounsel sends the relevant
prompt + document content to **one** AI provider: the one that serves the model
you picked. Nothing is sent to providers you did not select. CourtListener
legal-research calls go to CourtListener, not to an AI provider.

## Whose key is used (BYOK vs server fallback)

Per provider, key resolution is: **the user's own key first**, then the
server-wide env key, else none (`packages/core/src/ai/provider.ts` →
`resolveLlmKey`). The model picker shows the active source (`user` / `env`) so it
is never ambiguous. With bring-your-own-key, requests bill and log under the
firm's own provider account.

## Per-provider retention posture

| Provider          | Trains on API data?                                  | Out-of-the-box posture                                    | True zero-data-retention (ZDR)                                                                                              |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **OpenRouter**    | No                                                   | Zero prompt/completion logging by default (metadata only) | Self-serve — the only out-of-the-box ZDR. It is a proxy, so privileged data passes a third party before the model provider. |
| **Anthropic**     | No                                                   | ~7-day abuse-log retention; never trains on API data      | Separate enterprise ZDR agreement (approval).                                                                               |
| **OpenAI**        | No                                                   | 30-day abuse retention                                    | Org ZDR requires sales approval.                                                                                            |
| **Google Gemini** | No on the **paid** tier (the free tier _does_ train) | Paid/Vertex: no training, limited abuse logging           | Per-project ZDR request (approval). Reject free-tier keys.                                                                  |

## What gitcounsel sends today

These privacy flags are set in `ai/provider.ts`:

- **OpenAI** — `store: false` (no server-side response storage) + reasoning sent
  encrypted, never persisted.
- **OpenRouter** — `provider.dataCollection: "deny"` (route only to endpoints
  that do not retain/collect prompt data).
- **Anthropic / Gemini** — no training on API data by default; no extra flag is
  required for the default posture.

### Optional hardening

- OpenRouter also supports `zdr: true`, which restricts routing to ZDR-certified
  endpoints. It is stricter than `dataCollection: deny` but can reduce the set of
  available models — enable it deliberately, not by default.
- Use a **paid** Gemini key only; the free tier trains on submitted data.

## Enabling true ZDR

- **OpenRouter** — self-serve; the `dataCollection: deny` default already avoids
  retention. Add `zdr: true` for strict ZDR routing.
- **Anthropic / OpenAI / Google** — request an enterprise/per-project ZDR
  agreement with the provider; until then they retain short-lived abuse logs.

## User controls

- Pick the model (and therefore the provider) per chat message and per review run.
- Add or remove provider keys in Settings → AI & Models.
- Export or delete your organization's data anytime (Settings → Data & Privacy,
  and the retention policy in `docs/data-retention.md`).
