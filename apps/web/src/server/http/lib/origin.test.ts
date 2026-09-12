import { describe, expect, test } from "vite-plus/test";
import { Hono } from "hono";
import { serverOrigin } from "./origin";

function app(publicOrigin: string) {
  const app = new Hono();
  app.get("/", (c) => c.json({ origin: serverOrigin(c, publicOrigin) }));
  return app;
}

describe("public origin behind a reverse proxy", () => {
  test("configured HTTPS survives an internal HTTP hop and conflicting forwarded headers", async () => {
    const response = await app("https://staging.gitmatter.com/").request("http://internal:3000/", {
      headers: { "x-forwarded-proto": "http", "x-forwarded-host": "untrusted.example" },
    });
    expect(await response.json()).toEqual({ origin: "https://staging.gitmatter.com" });
  });
  test("local development can retain its explicit HTTP address", async () => {
    const response = await app("http://localhost:4280").request("http://internal/");
    expect(await response.json()).toEqual({ origin: "http://localhost:4280" });
  });
  test("self-hosted fallback still handles proxy chains without a configured origin", async () => {
    const response = await app("").request("http://internal/", {
      headers: {
        "x-forwarded-proto": "https, http",
        "x-forwarded-host": "legal.example, internal",
      },
    });
    expect(await response.json()).toEqual({ origin: "https://legal.example" });
  });
});
