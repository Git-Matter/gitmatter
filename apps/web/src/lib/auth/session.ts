import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "../../server/http/lib/auth";
import { getTenant } from "@workspace/core";

// Resolves the better-auth session on the server from the request's cookies.
// Called in the root route's beforeLoad so the session is known during SSR —
// the app can then render the correct (logged-in / logged-out) shell in the
// server HTML instead of a blank screen that waits for client-side hydration.
// createServerFn keeps the server-only `auth` (db, drizzle) out of the client
// bundle; the client gets an RPC stub.
export const getServerSession = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  return auth.api.getSession({ headers });
});

// Keep tenant reads behind a server-function boundary too. Importing
// `@workspace/core` directly from a route module makes its Postgres runtime
// part of the browser bundle, where it expects Node's global Buffer.
export const getServerTenant = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  const currentSession = await auth.api.getSession({ headers });
  if (!currentSession?.user.tenantId) return null;
  return getTenant(currentSession.user.tenantId);
});

export type ServerSession = Awaited<ReturnType<typeof getServerSession>>;
