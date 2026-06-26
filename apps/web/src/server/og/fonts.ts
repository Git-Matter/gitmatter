// Brand fonts for the OG image renderer, fetched once from the @fontsource CDN
// and cached for the life of the process. satori (inside @vercel/og) accepts
// woff; we load the two faces the marketing site uses — Geist headings and
// Inter body/labels — at the weights the banner draws with.
const BASE = "https://unpkg.com";
const FONT_FILES = [
  {
    name: "Geist",
    weight: 500 as const,
    file: "@fontsource/geist-sans@5/files/geist-sans-latin-500-normal.woff",
  },
  {
    name: "Geist",
    weight: 600 as const,
    file: "@fontsource/geist-sans@5/files/geist-sans-latin-600-normal.woff",
  },
  {
    name: "Inter",
    weight: 500 as const,
    file: "@fontsource/inter@5/files/inter-latin-500-normal.woff",
  },
  {
    name: "Inter",
    weight: 600 as const,
    file: "@fontsource/inter@5/files/inter-latin-600-normal.woff",
  },
];

export type OgFont = {
  name: string;
  weight: 500 | 600;
  style: "normal";
  data: ArrayBuffer;
};

let cache: Promise<OgFont[]> | null = null;

export function loadOgFonts(): Promise<OgFont[]> {
  if (!cache) {
    cache = Promise.all(
      FONT_FILES.map(async (f) => {
        const res = await fetch(`${BASE}/${f.file}`);
        if (!res.ok) throw new Error(`OG font fetch failed: ${f.file} (${res.status})`);
        return {
          name: f.name,
          weight: f.weight,
          style: "normal" as const,
          data: await res.arrayBuffer(),
        };
      })
    ).catch((err) => {
      // Don't poison the cache on a transient CDN failure — let the next request retry.
      cache = null;
      throw err;
    });
  }
  return cache;
}
