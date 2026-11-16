export * from "../../../apps/web/src/lib/auth/auth-client";
export function useSession() {
  return {
    data: {
      user: {
        id: "demo-reviewer",
        name: "Demo Reviewer",
        email: "reviewer@example.invalid",
        emailVerified: true,
        tenantRole: "admin" as const,
      },
      session: { id: "fictional-session", userId: "demo-reviewer" },
    },
    error: null,
    isPending: false,
    refetch: async () => null,
  };
}
