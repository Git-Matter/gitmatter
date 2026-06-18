import { cp, access } from "node:fs/promises";

// Next's `output: standalone` does NOT copy `.next/static` or `public` into the
// standalone bundle — you must do it yourself so the server can serve assets.
// This makes `.next/standalone/apps/docs` a self-contained deployable.
const base = ".next/standalone/apps/docs";

await cp(".next/static", `${base}/.next/static`, { recursive: true });

// The /docs/md/* route reads raw .mdx via getText at request time; the server's
// cwd is the standalone app dir, so ship the source markdown there.
await cp("content/docs", `${base}/content/docs`, { recursive: true });

try {
  await access("public");
  await cp("public", `${base}/public`, { recursive: true });
} catch {
  // no public/ dir — nothing to copy
}

console.log("postbuild: copied static assets + content into standalone output");
