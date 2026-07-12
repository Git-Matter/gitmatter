import { afterEach, describe, expect, test } from "vite-plus/test";
import { getUsFederalPackage, searchUsFederalLaw } from "../src/platform/external/govinfo.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: input instanceof Request ? input.url : String(input), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

describe("searchUsFederalLaw", () => {
  test("builds the search body with collection clause and capped pageSize", async () => {
    const calls = stubFetch({ count: 0, results: [] });
    await searchUsFederalLaw("k", { query: "chevron deference", collection: "USCODE", limit: 50 });
    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.govinfo.gov/search");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body.query).toBe("chevron deference collection:(USCODE)");
    expect(body.pageSize).toBe(20);
    expect((init!.headers as Record<string, string>)["X-Api-Key"]).toBe("k");
  });

  test("shapes results and surfaces non-ok status", async () => {
    stubFetch({
      count: 1,
      results: [
        {
          packageId: "PLAW-117publ58",
          title: "Infrastructure Investment and Jobs Act",
          collectionCode: "PLAW",
          dateIssued: "2021-11-15",
          resultLink: "https://api.govinfo.gov/packages/PLAW-117publ58/summary",
        },
      ],
    });
    const out = await searchUsFederalLaw("k", { query: "infrastructure" });
    expect(out.count).toBe(1);
    expect(out.results[0]?.packageId).toBe("PLAW-117publ58");
    expect(out.results[0]?.collection).toBe("PLAW");

    stubFetch("rate limited", 429);
    await expect(searchUsFederalLaw("k", { query: "x" })).rejects.toThrow(/govinfo error \(429\)/);
  });
});

describe("getUsFederalPackage", () => {
  test("trims the summary to the useful fields", async () => {
    stubFetch({
      packageId: "USCODE-2021-title5",
      title: "United States Code, Title 5",
      collectionCode: "USCODE",
      branch: "legislative",
      dateIssued: "2021-01-01",
      download: { pdfLink: "https://example.test/x.pdf" },
      irrelevantHugeField: "x".repeat(10_000),
    });
    const out = await getUsFederalPackage("k", { packageId: "USCODE-2021-title5" });
    expect(out.packageId).toBe("USCODE-2021-title5");
    expect(out.download).toEqual({ pdfLink: "https://example.test/x.pdf" });
    expect("irrelevantHugeField" in out).toBe(false);
  });
});
