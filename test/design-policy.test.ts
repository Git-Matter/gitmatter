import { describe, expect, test } from "vite-plus/test";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { checkProductMedia } from "../design/tooling/check-media";
import { getProductMedia } from "../apps/web/src/marketing/productMedia";
import { contrastRatio, inspectDesignSource } from "../design/tooling/design-policy";
import {
  renderDesignTokens,
  tokenSource,
  type DesignTokens,
} from "../design/tooling/design-tokens";

const inspect = (source: string) =>
  inspectDesignSource(source, "example.tsx").map((finding) => finding.rule);

describe("design policy structural guards", () => {
  test("catches prohibited class-like tokens in conditional string definitions", () => {
    expect(
      inspect('const x = ok ? "hover:bg-clip-text animate-bounce" : "shadow-[0_0_20px_red]";')
    ).toEqual(["DG001", "DG003", "DG006"]);
    expect(
      inspect('const help = "Do not add a glass-panel or animate-ping decoration.";')
    ).toContain("DG003");
    // Comments are not inspected, so documentation can explain the prohibited pattern.
    expect(inspect('// className="animate-ping"\nconst content = "plain text";')).toEqual([]);
  });
  test("rejects automatic playback, including dynamic values, while allowing explicit false", () => {
    expect(inspect('<video src="/demo.mp4" autoPlay controls />')).toContain("DG004");
    expect(inspect('<video src="/demo.mp4" autoPlay={preference} controls />')).toContain("DG004");
    expect(inspect('<video src="/demo.mp4" autoPlay={false} controls />')).toEqual([]);
    expect(inspect('<video src="/demo.mp4" controls={false} />')).toContain("DG004");
  });
  test("distinguishes a composed render host from nested interactive elements", () => {
    const header =
      'import {Button as Action} from "@/components/ui/button"; import {Link as RouteLink} from "@tanstack/react-router";';
    expect(
      inspect(header + '<Action render={<RouteLink to="/" />} nativeButton={false}>Home</Action>')
    ).toEqual([]);
    expect(inspect(header + '<RouteLink to="/"><Action>Home</Action></RouteLink>')).toEqual([
      "DG007",
    ]);
    expect(inspect('<button><a href="/">Home</a></button>')).toEqual(["DG007"]);
    expect(
      inspect(header + '<Action render={<a href="/"><button>Nested</button></a>} />')
    ).toContain("DG007");
  });
  test("detects an aliased magic icon", () => {
    expect(inspect('import { Sparkles as Magic } from "lucide-react";')).toEqual(["DG005"]);
    expect(inspect('import { Bot } from "lucide-react";')).toEqual([]);
  });
  test("requires the disclosed player for marketing while preserving ordinary attachment playback", () => {
    expect(getProductMedia("/demo.mp4").kind).toBe("illustration");
    expect(() => getProductMedia("/unknown.mp4")).toThrow("Register and review");
    expect(() => getProductMedia("toString")).toThrow("Register and review");
    const source = '<video src="/demo.mp4" controls />';
    expect(
      inspectDesignSource(source, "apps/web/src/marketing/Home.tsx").map((f) => f.rule)
    ).toEqual(["DG010"]);
    expect(
      inspectDesignSource(source, "apps/web/src/marketing/components/ProductVideo.tsx")
    ).toEqual([]);
    expect(inspectDesignSource(source, "apps/web/src/components/Attachment.tsx")).toEqual([]);
  });
});

describe("canonical design foundations", () => {
  test("detects changed or unregistered public media instead of silently inheriting an origin claim", async () => {
    const root = await mkdtemp(join(tmpdir(), "gitmatter-media-policy-"));
    try {
      await Promise.all(
        ["design", "apps/web/public", "apps/video/src"].map((path) =>
          mkdir(join(root, path), { recursive: true })
        )
      );
      const content = "fictional illustration bytes";
      await writeFile(join(root, "apps/web/public/demo.mp4"), content);
      await writeFile(
        join(root, "apps/video/src/Root.tsx"),
        'const compositions = [{ id: "Example" }];'
      );
      await writeFile(
        join(root, "apps/video/src/Example.tsx"),
        "export const Example = () => null;"
      );
      await writeFile(
        join(root, "design/media.json"),
        JSON.stringify({
          version: 1,
          assets: {
            "/demo.mp4": {
              kind: "illustration",
              composition: "Example",
              source: "apps/video/src/Example.tsx",
              sha256: createHash("sha256").update(content).digest("hex"),
            },
          },
        })
      );
      expect(await checkProductMedia(root)).toEqual([]);
      await writeFile(join(root, "apps/web/public/demo.mp4"), "changed bytes");
      await writeFile(join(root, "apps/web/public/unreviewed.mp4"), content);
      const findings = await checkProductMedia(root);
      expect(findings.some((finding) => finding.message.includes("Media changed"))).toBe(true);
      expect(findings.some((finding) => finding.message.includes("Register and review"))).toBe(
        true
      );
      await rm(join(root, "apps/web/public/demo.mp4"));
      expect(
        (await checkProductMedia(root)).some((finding) => finding.message.includes("missing/stale"))
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  test("generation is stable under object-key reordering and rejects mode drift", async () => {
    const tokens = JSON.parse(await readFile(tokenSource, "utf8")) as DesignTokens;
    const reordered = structuredClone(tokens);
    reordered.themes.light = Object.fromEntries(Object.entries(tokens.themes.light).reverse());
    expect(renderDesignTokens(reordered)).toBe(renderDesignTokens(tokens));
    delete reordered.themes.dark["--input"];
    expect(() => renderDesignTokens(reordered)).toThrow("same semantic roles");
  });
  test("rejects declaration injection", async () => {
    const tokens = JSON.parse(await readFile(tokenSource, "utf8")) as DesignTokens;
    tokens.shared["--radius"] = "12px; color: red";
    expect(() => renderDesignTokens(tokens)).toThrow("Invalid CSS token");
  });
  test("calculates sRGB contrast and refuses translucent or unknown values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(contrastRatio("#706d66", "#f2f1f0")).toBeGreaterThanOrEqual(4.5);
    expect(() => contrastRatio("transparent", "#ffffff")).toThrow("opaque sRGB");
  });
});
