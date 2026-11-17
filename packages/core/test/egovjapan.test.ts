import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  flattenLawText,
  getJapanLaw,
  searchJapanLaws,
} from "../src/platform/external/egovjapan.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stub fetch to capture the requested URL and return fixture JSON. */
function stubFetch(body: unknown, init?: { status?: number }) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calls.push(url instanceof Request ? url.url : String(url));
    return new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

describe("searchJapanLaws", () => {
  test("builds the /laws URL and shapes results", async () => {
    const calls = stubFetch({
      total_count: 2,
      laws: [
        {
          law_info: {
            law_id: "129AC0000000089",
            law_num: "明治二十九年法律第八十九号",
            promulgation_date: "1896-04-27",
          },
          current_revision_info: { law_title: "民法" },
        },
        {
          law_info: {
            law_id: "417AC0000000086",
            law_num: "平成十七年法律第八十六号",
            promulgation_date: "2005-07-26",
          },
          revision_info: { law_title: "会社法" },
        },
      ],
    });

    const out = await searchJapanLaws({ query: "民法" });

    const url = new URL(calls[0]!);
    expect(url.origin + url.pathname).toBe("https://laws.e-gov.go.jp/api/2/laws");
    expect(url.searchParams.get("law_title")).toBe("民法");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("response_format")).toBe("json");

    expect(out.totalCount).toBe(2);
    expect(out.results).toEqual([
      {
        lawId: "129AC0000000089",
        lawNum: "明治二十九年法律第八十九号",
        lawTitle: "民法",
        promulgationDate: "1896-04-27",
      },
      {
        lawId: "417AC0000000086",
        lawNum: "平成十七年法律第八十六号",
        lawTitle: "会社法",
        promulgationDate: "2005-07-26",
      },
    ]);
  });

  test("caps results at the requested limit", async () => {
    stubFetch({
      laws: [
        { law_info: { law_id: "a" }, revision_info: { law_title: "甲" } },
        { law_info: { law_id: "b" }, revision_info: { law_title: "乙" } },
      ],
    });
    const out = await searchJapanLaws({ query: "法", limit: 1 });
    expect(out.results).toHaveLength(1);
    expect(out.results[0]?.lawId).toBe("a");
  });

  test("throws with status and detail on error responses", async () => {
    stubFetch({ message: "not found" }, { status: 404 });
    await expect(searchJapanLaws({ query: "x" })).rejects.toThrow(/e-Gov error \(404\)/);
  });
});

describe("flattenLawText", () => {
  test("flattens nested nodes and breaks lines on block tags", () => {
    const text = flattenLawText({
      tag: "Law",
      children: [
        { tag: "LawTitle", children: ["民法"] },
        {
          tag: "Article",
          children: [
            { tag: "ArticleTitle", children: ["第一条"] },
            {
              tag: "Paragraph",
              children: [
                { tag: "Sentence", children: ["私権は、公共の福祉に適合しなければならない。"] },
              ],
            },
          ],
        },
      ],
    });
    expect(text).toBe("民法\n第一条\n私権は、公共の福祉に適合しなければならない。\n");
  });

  test("handles plain strings and empty nodes", () => {
    expect(flattenLawText("text")).toBe("text");
    expect(flattenLawText(undefined)).toBe("");
    expect(flattenLawText({ tag: "Ruby" })).toBe("");
  });
});

describe("getJapanLaw", () => {
  const fixture = {
    law_info: {
      law_id: "129AC0000000089",
      law_num: "明治二十九年法律第八十九号",
      promulgation_date: "1896-04-27",
    },
    current_revision_info: { law_title: "民法" },
    law_full_text: {
      tag: "Law",
      children: [
        { tag: "LawTitle", children: ["民法"] },
        { tag: "Sentence", children: ["第一条の本文。"] },
      ],
    },
  };

  test("builds the /law_data URL and flattens the full text", async () => {
    const calls = stubFetch(fixture);
    const out = await getJapanLaw({ lawId: "129AC0000000089" });

    expect(calls[0]).toBe(
      "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089?response_format=json"
    );
    expect(out.lawId).toBe("129AC0000000089");
    expect(out.lawNum).toBe("明治二十九年法律第八十九号");
    expect(out.lawTitle).toBe("民法");
    expect(out.promulgationDate).toBe("1896-04-27");
    expect(out.truncated).toBe(false);
    expect(out.text).toBe("民法\n第一条の本文。");
  });

  test("truncates long law text with a note", async () => {
    stubFetch({
      ...fixture,
      law_full_text: { tag: "Sentence", children: ["あ".repeat(9000)] },
    });
    const out = await getJapanLaw({ lawId: "129AC0000000089" });
    expect(out.truncated).toBe(true);
    expect(out.text.startsWith("あ".repeat(100))).toBe(true);
    expect(out.text).toContain("truncated at 8000");
    expect(out.text.length).toBeLessThan(8100);
  });

  test("URL-encodes the law id", async () => {
    const calls = stubFetch(fixture);
    await getJapanLaw({ lawId: "a/b" });
    expect(calls[0]).toContain("/law_data/a%2Fb?");
  });
});
