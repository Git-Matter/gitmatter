// Preview entry for `email dev` / `email export`. Default-exports the template
// with sample props so the React Email dev server can render it.
import { VerifyEmail } from "../templates.js";

const url = new URL(
  "/api/auth/verify-email",
  process.env.BETTER_AUTH_URL ?? "http://localhost:4280"
);
url.searchParams.set("token", "preview-token");

export default function VerifyPreview() {
  return <VerifyEmail url={url.toString()} />;
}
