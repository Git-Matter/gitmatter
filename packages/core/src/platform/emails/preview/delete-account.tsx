import { DeleteAccountEmail } from "../templates.js";

const url = new URL(
  "/api/auth/delete-user/callback",
  process.env.BETTER_AUTH_URL ?? "http://localhost:4280"
);
url.searchParams.set("token", "preview-token");

export default function DeleteAccountPreview() {
  return <DeleteAccountEmail url={url.toString()} />;
}
