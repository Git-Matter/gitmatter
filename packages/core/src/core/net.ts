// SSRF guard: is a hostname a private / loopback / link-local destination that
// an outbound fetch to user-supplied URLs should refuse? Covers IPv4 private +
// loopback + link-local + CGNAT ranges and the IPv6 equivalents.
//
// LIMITATION: this is a literal hostname/IP fast-path. It does NOT resolve DNS,
// so a public hostname whose A record points at a private IP (or DNS rebinding)
// is not caught here — full SSRF protection requires checking the resolved
// destination IP at connect time. Treat this as a first, cheap line of defense.

export function isPrivateHost(hostname: string): boolean {
  let h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) — unwrap to the embedded IPv4.
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) h = mapped[1]!;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "::") return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
  // IPv4 private + loopback + link-local + CGNAT + this-network.
  if (h.startsWith("0.")) return true; // 0.0.0.0/8
  if (h.startsWith("127.")) return true; // loopback
  if (h.startsWith("10.")) return true; // private
  if (h.startsWith("192.168.")) return true; // private
  if (h.startsWith("169.254.")) return true; // link-local (incl. cloud metadata)
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true; // 172.16/12 private
  if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(h)) return true; // 100.64/10 CGNAT
  return false;
}
