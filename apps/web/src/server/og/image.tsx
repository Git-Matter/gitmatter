import { ImageResponse } from "@vercel/og";
import { loadOgFonts } from "./fonts.js";

// Warm editorial palette (DESIGN.md: warm ivory paper, dark ink, bronze accent).
// Hard-coded hex rather than the app's oklch tokens, since satori's color parser
// is happiest with hex.
const IVORY = "#FAF8F4";
const INK = "#22242B";
const MUTED = "#6B6F76";
const BRONZE = "#7C5B3B";

// Render a 1200x630 share banner for a marketing page: a small wordmark, an
// uppercase bronze eyebrow, the page title in the heading face, and the
// domain along the bottom. Returns a PNG Response straight from @vercel/og.
export async function renderOgImage(opts: { title: string; eyebrow?: string }): Promise<Response> {
  const fonts = await loadOgFonts();
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: IVORY,
        padding: "80px",
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", fontFamily: "Geist", fontSize: 34, color: INK }}>
        gitmatter
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {opts.eyebrow ? (
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: BRONZE,
              marginBottom: 24,
            }}
          >
            {opts.eyebrow}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            fontFamily: "Geist",
            fontSize: 72,
            lineHeight: 1.05,
            color: INK,
            maxWidth: 960,
          }}
        >
          {opts.title}
        </div>
      </div>

      <div style={{ display: "flex", fontSize: 24, color: MUTED }}>gitmatter.com</div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
    }
  );
}
