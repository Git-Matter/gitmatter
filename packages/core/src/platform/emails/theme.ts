// Brand tokens for transactional emails, mirroring DESIGN.md. Email clients do
// not understand oklch(), so the cool slate palette is expressed here as the
// closest sRGB hex. Muted slate keeps raw links quiet; destructive tokens for the
// account-deletion email only.
export const palette = {
  ink: "#15181e", // Counsel Ink — primary text, primary button (matches the logo box)
  inkSoft: "#657083", // Soft slate — secondary text, footnotes, timestamps
  paper: "#f6f8fb", // Cool Paper — message background
  card: "#ffffff", // Raised surface
  sunken: "#eef3f8", // Sunken slate — the link fallback well
  hairline: "#dbe3ee", // Hairline — the only border weight
  link: "#475569", // Muted raw URL text
  danger: "#b23a2a", // destructive
  dangerSurface: "#f7ece9", // destructive-surface
} as const;

// Serif (Newsreader) for identity/headings, sans (Geist) for operational text —
// the Serif Earns It rule. Both fall back to web-safe stacks since most email
// clients ignore @font-face.
export const fonts = {
  serif: "'Newsreader', Georgia, 'Times New Roman', serif",
  sans: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
} as const;
