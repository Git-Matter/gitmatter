import { afterEach, describe, expect, test } from "vite-plus/test";
import { getCanadianCase, searchCanadianCaseLaw } from "../src/platform/external/canlii.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(handler: (url: string) => { status?: number; body: unknown }) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    const { status = 200, body } = handler(url);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

describe("searchCanadianCaseLaw", () => {
  test("without databaseId returns the database list", async () => {
    stubFetch(() => ({
      body: {
        caseDatabases: [{ databaseId: "onca", jurisdiction: "on", name: "Court of Appeal" }],
      },
    }));
    const out = (await searchCanadianCaseLaw("k", {})) as { databases: unknown[]; note: string };
    expect(out.note).toContain("databaseId");
    expect(out.databases).toEqual([
      { databaseId: "onca", jurisdiction: "on", name: "Court of Appeal" },
    ]);
  });

  test("browse URL carries api_key, capped resultCount and date filters", async () => {
    const calls = stubFetch(() => ({ body: { cases: [] } }));
    await searchCanadianCaseLaw("secret-key", {
      databaseId: "csc-scc",
      limit: 99,
      decisionDateAfter: "2020-01-01",
    });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!);
    expect(url.pathname).toBe("/v1/caseBrowse/en/csc-scc/");
    expect(url.searchParams.get("api_key")).toBe("secret-key");
    expect(url.searchParams.get("resultCount")).toBe("20");
    expect(url.searchParams.get("decisionDateAfter")).toBe("2020-01-01");
  });

  test("normalizes { en: ... } caseIds and shapes results", async () => {
    stubFetch(() => ({
      body: {
        cases: [
          {
            databaseId: "onca",
            caseId: { en: "2020onca123" },
            title: "R v X",
            citation: "2020 ONCA 123",
          },
        ],
      },
    }));
    const out = (await searchCanadianCaseLaw("k", { databaseId: "onca" })) as {
      results: Array<{ caseId: unknown }>;
    };
    expect(out.results[0]).toEqual({
      databaseId: "onca",
      caseId: "2020onca123",
      title: "R v X",
      citation: "2020 ONCA 123",
    });
  });

  test("redacts the key from error detail", async () => {
    stubFetch(() => ({ status: 403, body: "bad key: secret-key rejected" }));
    await expect(searchCanadianCaseLaw("secret-key", { databaseId: "onca" })).rejects.toThrow(
      /\*\*\*/
    );
  });
});

describe("getCanadianCase", () => {
  test("merges metadata with citator and survives a citator failure", async () => {
    stubFetch((url) =>
      url.includes("caseCitator")
        ? { status: 403, body: "no citator tier" }
        : { body: { title: "R v X", citation: "2020 ONCA 123", decisionDate: "2020-02-02" } }
    );
    const out = await getCanadianCase("k", { databaseId: "onca", caseId: "2020onca123" });
    expect(out.title).toBe("R v X");
    expect(out.citedCases).toBeUndefined();
  });
});
