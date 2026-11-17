import { afterEach, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import type { FunnelProperties } from "@workspace/contracts";
import { recordFunnel, setFunnelSink } from "../src/core/funnel.js";
import { resetLogForTest, setLogDestinationForTest } from "../src/core/log.js";

afterEach(() => {
  setFunnelSink(null);
  resetLogForTest();
});

test("legal content and identity cannot reach either funnel sink", () => {
  const logs: string[] = [];
  const captured: unknown[] = [];
  setLogDestinationForTest({
    write: (chunk) => {
      logs.push(String(chunk));
    },
  });
  setFunnelSink((event, properties) => captured.push({ event, properties }));
  recordFunnel("redline_proposed", {
    actorType: "agent",
    documentId: randomUUID(),
    durationMs: 10,
    prompt: "CLIENT LEGAL TEXT",
    citation: "CLIENT LEGAL TEXT",
    filename: "CLIENT LEGAL TEXT",
    error: "CLIENT LEGAL TEXT",
    email: "CLIENT LEGAL TEXT",
    agentLabel: "CLIENT LEGAL TEXT",
    model: "CLIENT LEGAL TEXT",
  } as FunnelProperties);
  expect(captured).toHaveLength(1);
  expect(JSON.stringify(captured)).not.toContain("CLIENT LEGAL TEXT");
  expect(logs.join("")).not.toContain("CLIENT LEGAL TEXT");
  expect(captured[0]).toMatchObject({
    event: "redline_proposed",
    properties: { actorType: "agent", durationMs: 10 },
  });
});

test("rejects malformed identifiers and numeric values without breaking work", () => {
  const captured: unknown[] = [];
  setFunnelSink((event, properties) => captured.push({ event, properties }));
  recordFunnel("upload_started", { actorType: "user", matterId: "Client Name" });
  recordFunnel("extraction_ready", { actorType: "agent", durationMs: Number.NaN });
  expect(captured).toHaveLength(0);
});

test("sink failure never changes the outcome of legal work", () => {
  setFunnelSink(() => {
    throw new Error("offline");
  });
  expect(() =>
    recordFunnel("document_exported", { actorType: "user", documentId: randomUUID() })
  ).not.toThrow();
});
