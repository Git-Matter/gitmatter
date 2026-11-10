import { expect, test } from "vite-plus/test";
import { createClientSchema, createMatterSchema } from "./matters";

test("public create schemas discard caller-provided internal fixture identities", () => {
  const id = "ed8c32fb-54d0-469d-9d4d-bd8f6df5f01f";
  expect(createClientSchema.parse({ id, name: "Client" })).not.toHaveProperty("id");
  expect(
    createMatterSchema.parse({ id, clientId: id, name: "Matter", jurisdiction: "AU-NSW" })
  ).toEqual({ clientId: id, name: "Matter", jurisdiction: "AU-NSW" });
});

test("matter creation accepts recognised jurisdictions and rejects unknown codes", () => {
  const clientId = "ed8c32fb-54d0-469d-9d4d-bd8f6df5f01f";
  expect(
    createMatterSchema.parse({ clientId, name: "Matter", jurisdiction: "AU-VIC" }).jurisdiction
  ).toBe("AU-VIC");
  expect(
    createMatterSchema.safeParse({ clientId, name: "Matter", jurisdiction: "MADE-UP" }).success
  ).toBe(false);
});
