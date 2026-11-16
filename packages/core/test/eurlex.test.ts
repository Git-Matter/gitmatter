import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  buildSearchSparql,
  escapeSparqlLiteral,
  getEuLaw,
  searchEuLaw,
  shapeSearchResults,
  stripHtmlToText,
} from "../src/platform/external/eurlex.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(handler: (url: string) => Response) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return calls;
}

describe("escapeSparqlLiteral", () => {
  test("escapes quotes and backslashes, flattens newlines", () => {
    expect(escapeSparqlLiteral('data "protection"')).toBe('data \\"protection\\"');
    expect(escapeSparqlLiteral("a\\b")).toBe("a\\\\b");
    expect(escapeSparqlLiteral("line1\r\nline2")).toBe("line1 line2");
  });
});

describe("buildSearchSparql", () => {
  test("embeds lowercased escaped query and limit", () => {
    const q = buildSearchSparql('GDPR "final"', 5);
    expect(q).toContain('CONTAINS(LCASE(STR(?title)), "gdpr \\"final\\"")');
    expect(q).toContain("LIMIT 5");
    expect(q).toContain("cdm:resource_legal_id_celex");
  });
});

describe("shapeSearchResults", () => {
  test("maps bindings, trims title, keeps last segment of type URI", () => {
    const rows = shapeSearchResults([
      {
        celex: { value: "32016R0679" },
        title: { value: "x".repeat(400) },
        date: { value: "2016-04-27" },
        type: { value: "http://publications.europa.eu/resource/authority/resource-type/REG" },
      },
      {},
    ]);
    expect(rows[0]?.celex).toBe("32016R0679");
    expect(rows[0]?.title).toHaveLength(300);
    expect(rows[0]?.date).toBe("2016-04-27");
    expect(rows[0]?.type).toBe("REG");
    expect(rows[1]).toEqual({
      celex: undefined,
      title: undefined,
      date: undefined,
      type: undefined,
    });
  });
});

describe("stripHtmlToText", () => {
  test("drops scripts/styles/tags and decodes entities", () => {
    const html =
      "<html><head><style>p{color:red}</style><script>alert(1)</script></head>" +
      "<body><p>Article&nbsp;1 &amp; Article 2</p><div>&quot;scope&quot;</div></body></html>";
    expect(stripHtmlToText(html)).toBe('Article 1 & Article 2 "scope"');
  });

  test("collapses whitespace", () => {
    expect(stripHtmlToText("<p>a</p>\n\n  <p>b</p>")).toBe("a b");
  });
});

describe("searchEuLaw", () => {
  test("sends SPARQL GET with JSON format and shapes results", async () => {
    const calls = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            results: {
              bindings: [{ celex: { value: "32016R0679" }, title: { value: "GDPR" } }],
            },
          }),
          { status: 200 }
        )
    );
    const out = await searchEuLaw({ query: "data protection", limit: 3 });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!);
    expect(url.origin + url.pathname).toBe("https://publications.europa.eu/webapi/rdf/sparql");
    expect(url.searchParams.get("format")).toBe("application/sparql-results+json");
    expect(url.searchParams.get("query")).toContain('"data protection"');
    expect(url.searchParams.get("query")).toContain("LIMIT 3");
    expect(out).toEqual({
      query: "data protection",
      results: [{ celex: "32016R0679", title: "GDPR", date: undefined, type: undefined }],
    });
  });

  test("caps limit at 25 and defaults to 10", async () => {
    const calls = stubFetch(
      () => new Response(JSON.stringify({ results: { bindings: [] } }), { status: 200 })
    );
    await searchEuLaw({ query: "gdpr", limit: 100 });
    await searchEuLaw({ query: "gdpr" });
    expect(new URL(calls[0]!).searchParams.get("query")).toContain("LIMIT 25");
    expect(new URL(calls[1]!).searchParams.get("query")).toContain("LIMIT 10");
  });

  test("throws with status on non-ok response", async () => {
    stubFetch(() => new Response("server exploded", { status: 500 }));
    await expect(searchEuLaw({ query: "gdpr" })).rejects.toThrow("EUR-Lex SPARQL error (500)");
  });
});

describe("getEuLaw", () => {
  test("rejects malformed CELEX without fetching", async () => {
    const calls = stubFetch(() => new Response("", { status: 200 }));
    await expect(getEuLaw({ celex: "not a celex!" })).rejects.toThrow("Invalid CELEX");
    expect(calls).toHaveLength(0);
  });

  test("fetches EUR-Lex HTML and returns stripped text", async () => {
    const calls = stubFetch(
      () => new Response("<html><body><p>Article 1</p><p>Scope</p></body></html>", { status: 200 })
    );
    const out = await getEuLaw({ celex: "32016R0679" });
    expect(calls[0]).toBe("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679");
    expect(out.celex).toBe("32016R0679");
    expect(out.text).toBe("Article 1 Scope");
    expect(out.truncated).toBe(false);
  });

  test("truncates long documents with a note", async () => {
    stubFetch(() => new Response(`<p>${"word ".repeat(3000)}</p>`, { status: 200 }));
    const out = await getEuLaw({ celex: "32016R0679" });
    expect(out.truncated).toBe(true);
    expect(out.text).toContain("[Truncated at 8000 characters.");
    expect(out.text.length).toBeLessThan(8200);
  });

  test("throws with status on non-ok response", async () => {
    stubFetch(() => new Response("not found", { status: 404 }));
    await expect(getEuLaw({ celex: "32016R0679" })).rejects.toThrow("EUR-Lex error (404)");
  });
});
