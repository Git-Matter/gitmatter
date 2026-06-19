// Shared palette + type stacks for the gitmatter showcase. Mirrors the
// marketing "Quiet Chambers" look: deep ink ground, bronze accent, muted text.
export const theme = {
  ink: "#ffffff",
  panel: "#f4f4f5",
  border: "#d9d9dd",
  text: "#141414",
  muted: "#6b6b70",
  bronze: "#141414",
  green: "#3f3f46",
} as const;

export const fonts = {
  heading: "Georgia, 'Times New Roman', serif",
  mono: "'SF Mono', ui-monospace, 'JetBrains Mono', Menlo, monospace",
  body: "system-ui, -apple-system, sans-serif",
} as const;
