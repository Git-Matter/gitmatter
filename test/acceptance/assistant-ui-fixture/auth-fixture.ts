/** Fictional identity only; no authentication client or credential operation. */
export function useSession() {
  return {
    data: {
      user: {
        id: "fixture-user",
        name: "Fictional Reviewer",
        email: "reviewer@example.com",
        tenantRole: "member" as const,
      },
    },
    isPending: false,
    error: null,
    refetch: async () => null,
  };
}
