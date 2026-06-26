import { InviteEmail } from "../templates.js";

const url = new URL("/signup", process.env.BETTER_AUTH_URL ?? "http://localhost:4280");
url.searchParams.set("email", "invitee@example.com");

export default function InvitePreview() {
  return <InviteEmail url={url.toString()} orgName="Acme Legal" />;
}
