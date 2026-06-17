import { describe, expect, test } from "vite-plus/test";
import { isPrivateHost } from "../src/core/net.js";

describe("isPrivateHost", () => {
  test("blocks loopback / private / link-local / CGNAT literals", () => {
    for (const h of [
      "localhost",
      "app.localhost",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.1",
      "169.254.169.254", // cloud metadata
      "172.16.0.1",
      "172.31.255.255",
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1", // IPv4-mapped IPv6
    ]) {
      expect(isPrivateHost(h), h).toBe(true);
    }
  });

  test("allows public hosts", () => {
    for (const h of [
      "example.com",
      "8.8.8.8",
      "1.1.1.1",
      "172.32.0.1",
      "100.63.0.1",
      "2606:4700::1",
    ]) {
      expect(isPrivateHost(h), h).toBe(false);
    }
  });
});
