# gitmatter

**The audited legal backend that any AI agent plugs into.**

gitmatter does AI-assisted legal review — contract redline, tabular extraction, document
generation, and reusable workflows — on a **git-style audit spine**: every change, whether made by a
person in the UI or by an AI agent, is a commit with author, message, field-level diff, and blame,
in one history. Chat answers cite their sources, reviews export to CSV/XLSX, and any agent can
generate a downloadable Word file.

What makes it different:

- **Bring your own agent.** A firm connects the AI client it already uses — ChatGPT, Claude
  Desktop, Claude web — to gitmatter as a connector. A lawyer says _"review these NDAs"_ in their
  own assistant; the agent drives gitmatter's tools; gitmatter does the work and records every
  action. The firm's AI on the front, gitmatter's audited legal engine behind.
- **Bring your own key.** gitmatter's own features (review, chat) run on the firm's LLM key —
  multi-provider (Claude / Gemini / OpenAI / OpenRouter), stored encrypted, configured for zero
  data retention.
- **Built for how firms work.** Organized as **Client → Matter → artifacts**, with a legal team
  staffed per matter and every change traceable to a member.

## Credits

gitmatter is heavily inspired by **[mikeoss](https://mikeoss.com)** (mike) — the legal-document AI
assistant whose review surfaces this project builds on. gitmatter adapts mikeoss's contract
redline, tabular review, workflows, and chat, and ports several of its libraries (DOCX tracked
changes, tabular cell extraction, encrypted key storage, the LLM tool loop). On top of that it adds
the two things mikeoss does not have: a **git-style audit spine** (every change is a commit with
blame) and **agent connectivity in both directions** (any AI client can drive the same audited
tools over MCP). Full credit to mikeoss for the original product and approach.

## Build & run

See **[docs/admin/self-hosting.mdx](docs/admin/self-hosting.mdx)** — setup, local development, and
the full Docker stack — and **[docs/ai-agents/connect-an-agent.mdx](docs/ai-agents/connect-an-agent.mdx)**
for connecting an AI agent over MCP. These render on the docs site under `/docs`.
