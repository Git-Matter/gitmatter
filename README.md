# gitcounsel

**The audited legal backend that any AI agent plugs into.**

gitcounsel does AI-assisted legal review — contract redline, tabular extraction, and reusable
workflows — on a **git-style audit spine**: every change, whether made by a person in the UI or by
an AI agent, is a commit with author, message, field-level diff, and blame, in one history.

What makes it different:

- **Bring your own agent.** A firm connects the AI client it already uses — ChatGPT, Claude
  Desktop, Claude web — to gitcounsel as a connector. A lawyer says _"review these NDAs"_ in their
  own assistant; the agent drives gitcounsel's tools; gitcounsel does the work and records every
  action. The firm's AI on the front, gitcounsel's audited legal engine behind.
- **Bring your own key.** gitcounsel's own features (review, chat) run on the firm's LLM key
  (Anthropic or OpenAI), stored encrypted.
- **Built for how firms work.** Organized as **Client → Matter → artifacts**, with a legal team
  staffed per matter and every change traceable to a member.

> Inspired by [mikeoss](https://mikeoss.com). gitcounsel adapts its review/workflow surfaces and
> adds the two things mikeoss lacks: a full audit spine and agent connectivity in both directions.

## Build & run

See **[docs/manual.md](docs/manual.md)** — setup, local development, the full Docker stack, and how
to connect an AI agent over MCP.
