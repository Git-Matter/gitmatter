/** Keep post-login navigation within this application, including the MFA hop. */
export function safeLoginNext(next: string | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    Array.from(next).some((character) => character.charCodeAt(0) <= 32)
  )
    return "/assistant";
  return next;
}
