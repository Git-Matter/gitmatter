import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  buildSearchBody,
  hasLegifranceCreds,
  shapeSearchResult,
} from "../src/platform/external/legifrance.js";

const ENV_KEYS = ["LEGIFRANCE_CLIENT_ID", "LEGIFRANCE_CLIENT_SECRET"] as const;
const saved = ENV_KEYS.map((k) => [k, process.env[k]] as const);
afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("hasLegifranceCreds", () => {
  test("false without both env credentials, true with both", () => {
    for (const k of ENV_KEYS) delete process.env[k];
    expect(hasLegifranceCreds()).toBe(false);
    process.env.LEGIFRANCE_CLIENT_ID = "id";
    expect(hasLegifranceCreds()).toBe(false);
    process.env.LEGIFRANCE_CLIENT_SECRET = "secret";
    expect(hasLegifranceCreds()).toBe(true);
  });
});

describe("buildSearchBody", () => {
  test("embeds the query, clamps pageSize to 10 and defaults fond", () => {
    const body = buildSearchBody({ query: "clause de non-concurrence", limit: 50 }) as {
      recherche: { pageSize: number; champs: Array<{ criteres: Array<{ valeur: string }> }> };
      fond: string;
    };
    expect(body.fond).toBe("LODA_ETAT");
    expect(body.recherche.pageSize).toBe(10);
    expect(body.recherche.champs[0]?.criteres[0]?.valeur).toBe("clause de non-concurrence");
  });

  test("honors an explicit fond", () => {
    expect((buildSearchBody({ query: "x", fond: "CODE_ETAT" }) as { fond: string }).fond).toBe(
      "CODE_ETAT"
    );
  });
});

describe("shapeSearchResult", () => {
  test("prefers titles, falls back to extracts, strips snippet HTML", () => {
    const shaped = shapeSearchResult({
      titles: [{ id: "LEGITEXT000006069570", title: "Code civil" }],
      nature: "CODE",
      date: "2024-01-01",
      sections: [
        {
          extracts: [
            { id: "LEGIARTI0001", title: "Article 1101", values: ["<b>Le contrat</b> est"] },
          ],
        },
      ],
    });
    expect(shaped.id).toBe("LEGITEXT000006069570");
    expect(shaped.title).toBe("Code civil");
    expect(shaped.snippet).toBe("Le contrat est");

    const fallback = shapeSearchResult({
      sections: [{ extracts: [{ id: "LEGIARTI0002", title: "Article 2" }] }],
    });
    expect(fallback.id).toBe("LEGIARTI0002");
    expect(fallback.title).toBe("Article 2");
    expect(fallback.snippet).toBeUndefined();
  });
});
