/** The isolated UI fixture has no session or authentication client. */
export function useSession() {
  return { data: null, error: null, isPending: false, refetch: async () => null };
}
