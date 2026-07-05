import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  logEvent,
  resetLogForTest,
  setErrorReporter,
  setLogDestinationForTest,
} from "../src/core/log.js";

function restoreEnv(name: string, old: string | undefined) {
  if (old === undefined) delete process.env[name];
  else process.env[name] = old;
}

function captureLogs() {
  const lines: string[] = [];
  setLogDestinationForTest({
    write(line: string) {
      lines.push(line);
    },
  });
  return lines;
}

function readLogs(lines: string[]) {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(() => {
  resetLogForTest();
});

describe("logEvent", () => {
  test("writes structured pino json", () => {
    const old = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";
    try {
      const lines = captureLogs();
      logEvent("info", "request", { path: "/api/health", status: 200 });

      expect(readLogs(lines)[0]).toMatchObject({
        msg: "request",
        path: "/api/health",
        status: 200,
      });
    } finally {
      restoreEnv("LOG_LEVEL", old);
    }
  });

  test("respects LOG_LEVEL", () => {
    const old = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "warn";
    try {
      const lines = captureLogs();
      logEvent("info", "quiet");
      logEvent("warn", "visible");

      expect(readLogs(lines).map((line) => line.msg)).toEqual(["visible"]);
    } finally {
      restoreEnv("LOG_LEVEL", old);
    }
  });

  test("forwards only error-level logs to the reporter", () => {
    const old = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "trace";
    try {
      const seen: Array<{ level: string; msg: string }> = [];
      captureLogs();
      setErrorReporter((level, msg) => {
        seen.push({ level, msg });
      });

      logEvent("info", "started");
      logEvent("warn", "slow");
      logEvent("error", "failed");
      logEvent("fatal", "crashed");

      expect(seen).toEqual([
        { level: "error", msg: "failed" },
        { level: "fatal", msg: "crashed" },
      ]);
    } finally {
      restoreEnv("LOG_LEVEL", old);
    }
  });

  test("can suppress reporter forwarding for already-captured errors", () => {
    const old = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";
    try {
      const seen: string[] = [];
      captureLogs();
      setErrorReporter((_level, msg) => {
        seen.push(msg);
      });

      logEvent("error", "unhandled", { path: "/api/test" }, { report: false });

      expect(seen).toEqual([]);
    } finally {
      restoreEnv("LOG_LEVEL", old);
    }
  });

  test("redacts sensitive fields", () => {
    const old = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";
    try {
      const lines = captureLogs();
      logEvent("info", "secret", {
        apiKey: "sk-test",
        token: "bearer-token",
        headers: { authorization: "Bearer abc", cookie: "sid=123" },
      });

      expect(readLogs(lines)[0]).toMatchObject({
        apiKey: "[redacted]",
        token: "[redacted]",
        headers: { authorization: "[redacted]", cookie: "[redacted]" },
      });
    } finally {
      restoreEnv("LOG_LEVEL", old);
    }
  });

  test("redacts reporter fields before forwarding to Sentry", () => {
    const old = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";
    try {
      let fields: Record<string, unknown> | undefined;
      captureLogs();
      setErrorReporter((_level, _msg, extra) => {
        fields = extra;
      });

      logEvent("error", "failed", {
        apiKey: "sk-test",
        nested: { token: "bearer-token" },
        headers: { authorization: "Bearer abc" },
      });

      expect(fields).toEqual({
        apiKey: "[redacted]",
        nested: { token: "[redacted]" },
        headers: { authorization: "[redacted]" },
      });
    } finally {
      restoreEnv("LOG_LEVEL", old);
    }
  });
});
