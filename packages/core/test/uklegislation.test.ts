import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  buildDocumentUrl,
  getUkLegislation,
  parseAtomEntries,
  searchUkLegislation,
  xmlToText,
} from "../src/platform/external/uklegislation.js";

const ATOM_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:ukm="http://www.legislation.gov.uk/namespaces/metadata">
  <title>Search Results</title>
  <entry>
    <id>http://www.legislation.gov.uk/id/ukpga/2018/12</id>
    <title>Data Protection Act 2018</title>
    <link rel="self" href="http://www.legislation.gov.uk/id/ukpga/2018/12"/>
    <link rel="alternate" href="http://www.legislation.gov.uk/ukpga/2018/12"/>
  </entry>
  <entry>
    <id>http://www.legislation.gov.uk/id/uksi/2019/419</id>
    <title>The Data Protection &amp; Charges Regulations 2019</title>
    <link href="http://www.legislation.gov.uk/uksi/2019/419"/>
  </entry>
</feed>`;

const CLML_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<Legislation xmlns="http://www.legislation.gov.uk/namespaces/legislation">
  <!-- editorial comment -->
  <Body>
    <P1><Pnumber>1</Pnumber><Text>Personal data &amp; processing.</Text></P1>
    <P1><Text>The controller must comply.</Text></P1>
  </Body>
</Legislation>`;

describe("parseAtomEntries", () => {
  test("extracts title, link, id and type/year/number from entries", () => {
    const entries = parseAtomEntries(ATOM_FIXTURE);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      title: "Data Protection Act 2018",
      href: "http://www.legislation.gov.uk/ukpga/2018/12",
      id: "http://www.legislation.gov.uk/id/ukpga/2018/12",
      type: "ukpga",
      year: "2018",
      number: "12",
    });
    // Second entry has no alternate link; falls back to the first href.
    expect(entries[1]?.title).toBe("The Data Protection & Charges Regulations 2019");
    expect(entries[1]?.href).toBe("http://www.legislation.gov.uk/uksi/2019/419");
    expect(entries[1]?.type).toBe("uksi");
  });

  test("returns empty array for a feed with no entries", () => {
    expect(parseAtomEntries("<feed><title>empty</title></feed>")).toEqual([]);
  });
});

describe("xmlToText", () => {
  test("strips tags, comments and prolog; decodes entities; collapses whitespace", () => {
    expect(xmlToText(CLML_FIXTURE)).toBe(
      "1 Personal data & processing. The controller must comply."
    );
  });
});

describe("buildDocumentUrl", () => {
  test("builds the CLML URL for a whole act", () => {
    expect(buildDocumentUrl({ type: "ukpga", year: "2018", number: "12" })).toBe(
      "https://www.legislation.gov.uk/ukpga/2018/12/data.xml"
    );
  });

  test("appends the section segment when given", () => {
    expect(buildDocumentUrl({ type: "ukpga", year: "2018", number: "12", section: "3" })).toBe(
      "https://www.legislation.gov.uk/ukpga/2018/12/section/3/data.xml"
    );
  });
});

describe("fetching (stubbed)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("searchUkLegislation hits the feed URL and applies the limit", async () => {
    let requested = "";
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      requested = url instanceof Request ? url.url : String(url);
      return new Response(ATOM_FIXTURE, { status: 200 });
    }) as typeof fetch;
    const out = await searchUkLegislation({ query: "data protection", limit: 1 });
    expect(requested).toBe("https://www.legislation.gov.uk/all/data.feed?text=data%20protection");
    expect(out.results).toHaveLength(1);
    expect(out.results[0]?.title).toBe("Data Protection Act 2018");
  });

  test("getUkLegislation returns stripped text and no truncation for short docs", async () => {
    globalThis.fetch = (async () => new Response(CLML_FIXTURE, { status: 200 })) as typeof fetch;
    const out = await getUkLegislation({ type: "ukpga", year: "2018", number: "12" });
    expect(out.text).toContain("Personal data & processing.");
    expect(out.truncated).toBe(false);
  });

  test("getUkLegislation caps long documents and flags truncation", async () => {
    const long = `<Body><Text>${"word ".repeat(5_000)}</Text></Body>`;
    globalThis.fetch = (async () => new Response(long, { status: 200 })) as typeof fetch;
    const out = await getUkLegislation({ type: "ukpga", year: "2018", number: "12" });
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBe(8_000);
  });

  test("non-ok responses throw with status and detail", async () => {
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    await expect(searchUkLegislation({ query: "x" })).rejects.toThrow(
      "legislation.gov.uk error (404): not found"
    );
  });
});
