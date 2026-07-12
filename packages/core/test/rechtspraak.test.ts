import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  buildSearchUrl,
  getDutchCaseLaw,
  parseAtomEntries,
  searchDutchCaseLaw,
} from "../src/platform/external/rechtspraak.js";

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

const ATOM_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Rechtspraak.nl - zoeken in uitspraken</title>
  <entry>
    <id>ECLI:NL:HR:2014:952</id>
    <title type="text">ECLI:NL:HR:2014:952, Hoge Raad, 18-04-2014</title>
    <summary type="text">Arbeidsrecht. Ontslag &amp; loonvordering.</summary>
    <updated>2014-04-18T00:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://uitspraken.rechtspraak.nl/details?id=ECLI:NL:HR:2014:952"/>
  </entry>
  <entry>
    <id>ECLI:NL:RBAMS:2020:1234</id>
    <title type="text">ECLI:NL:RBAMS:2020:1234, Rechtbank Amsterdam, 01-03-2020</title>
    <summary type="text">Huurrecht. Ontbinding huurovereenkomst.</summary>
    <updated>2020-03-01T00:00:00Z</updated>
  </entry>
</feed>`;

const CONTENT_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<open-rechtspraak>
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dcterms="http://purl.org/dc/terms/">
    <rdf:Description>
      <dcterms:title>ECLI:NL:HR:2014:952, Hoge Raad, 18-04-2014</dcterms:title>
      <dcterms:creator rdf:resource="http://standaarden.overheid.nl/owms/terms/Hoge_Raad_der_Nederlanden">Hoge Raad</dcterms:creator>
      <dcterms:date rdf:datatype="http://www.w3.org/2001/XMLSchema#date">2014-04-18</dcterms:date>
    </rdf:Description>
  </rdf:RDF>
  <uitspraak id="ECLI:NL:HR:2014:952">
    <section><title>Uitspraak</title>
    <para>De Hoge Raad overweegt als volgt &amp; verwerpt het beroep.</para></section>
  </uitspraak>
</open-rechtspraak>`;

describe("buildSearchUrl", () => {
  test("maps only the metadata filters the index supports", () => {
    const url = new URL(
      buildSearchUrl({ date: "2020-03-01", creator: "Hoge Raad", subject: "civiel", limit: 5 })
    );
    expect(url.origin + url.pathname).toBe("https://data.rechtspraak.nl/uitspraken/zoeken");
    expect(url.searchParams.get("max")).toBe("5");
    expect(url.searchParams.get("date")).toBe("2020-03-01");
    expect(url.searchParams.get("creator")).toBe("Hoge Raad");
    expect(url.searchParams.get("subject")).toBe("civiel");
    expect(url.searchParams.has("query")).toBe(false);
  });

  test("over-fetches when a client-side keyword query is given", () => {
    const url = new URL(buildSearchUrl({ query: "huur", limit: 3 }));
    expect(url.searchParams.get("max")).toBe("50");
    // Never sends the keyword to the API — it has no full-text search.
    expect(url.search).not.toContain("huur");
  });
});

describe("parseAtomEntries", () => {
  test("extracts ecli, title, summary, and link from Atom entries", () => {
    const entries = parseAtomEntries(ATOM_FIXTURE);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      ecli: "ECLI:NL:HR:2014:952",
      title: "ECLI:NL:HR:2014:952, Hoge Raad, 18-04-2014",
      summary: "Arbeidsrecht. Ontslag & loonvordering.",
      link: "https://uitspraken.rechtspraak.nl/details?id=ECLI:NL:HR:2014:952",
    });
  });

  test("falls back to the deeplink when an entry has no <link>", () => {
    const entries = parseAtomEntries(ATOM_FIXTURE);
    expect(entries[1]?.link).toBe(
      "https://uitspraken.rechtspraak.nl/details?id=ECLI%3ANL%3ARBAMS%3A2020%3A1234"
    );
  });

  test("returns empty array for a feed without entries", () => {
    expect(parseAtomEntries("<feed></feed>")).toEqual([]);
  });
});

describe("searchDutchCaseLaw", () => {
  test("filters client-side on the keyword query", async () => {
    const calls = stubFetch(() => new Response(ATOM_FIXTURE, { status: 200 }));
    const out = await searchDutchCaseLaw({ query: "huurrecht", limit: 10 });
    expect(calls[0]).toContain("/uitspraken/zoeken?");
    expect(out.results).toHaveLength(1);
    expect(out.results[0]?.ecli).toBe("ECLI:NL:RBAMS:2020:1234");
    expect(out.note).toContain("metadata");
  });

  test("returns all entries up to limit without a query", async () => {
    stubFetch(() => new Response(ATOM_FIXTURE, { status: 200 }));
    const out = await searchDutchCaseLaw({ limit: 1 });
    expect(out.results).toHaveLength(1);
    expect(out.results[0]?.ecli).toBe("ECLI:NL:HR:2014:952");
  });

  test("throws with status on HTTP error", async () => {
    stubFetch(() => new Response("bad request", { status: 400 }));
    await expect(searchDutchCaseLaw({ date: "not-a-date" })).rejects.toThrow(
      "Rechtspraak error (400)"
    );
  });
});

describe("getDutchCaseLaw", () => {
  test("extracts metadata and tag-stripped judgment text", async () => {
    const calls = stubFetch(() => new Response(CONTENT_FIXTURE, { status: 200 }));
    const out = await getDutchCaseLaw({ ecli: " ECLI:NL:HR:2014:952 " });
    expect(calls[0]).toBe(
      "https://data.rechtspraak.nl/uitspraken/content?id=ECLI%3ANL%3AHR%3A2014%3A952"
    );
    expect(out.ecli).toBe("ECLI:NL:HR:2014:952");
    expect(out.title).toBe("ECLI:NL:HR:2014:952, Hoge Raad, 18-04-2014");
    expect(out.court).toBe("Hoge Raad");
    expect(out.date).toBe("2014-04-18");
    expect(out.truncated).toBe(false);
    expect(out.text).toContain("De Hoge Raad overweegt als volgt & verwerpt het beroep.");
    expect(out.text).not.toContain("<para>");
  });

  test("truncates long judgment text with a note", async () => {
    const long = CONTENT_FIXTURE.replace(
      "verwerpt het beroep.",
      `verwerpt het beroep. ${"overweging ".repeat(1000)}`
    );
    stubFetch(() => new Response(long, { status: 200 }));
    const out = await getDutchCaseLaw({ ecli: "ECLI:NL:HR:2014:952" });
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBeLessThan(8200);
    expect(out.text).toContain("[Truncated at 8000 characters");
  });

  test("throws when the response contains no decision", async () => {
    stubFetch(() => new Response("<open-rechtspraak></open-rechtspraak>", { status: 200 }));
    await expect(getDutchCaseLaw({ ecli: "ECLI:NL:XX:9999:1" })).rejects.toThrow(
      "no decision found"
    );
  });
});
