import { ResetPasswordEmail } from "../templates.js";

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:4280";
const callback = new URL("/reset-password", origin);
const url = new URL("/api/auth/reset-password/preview-token", origin);
url.searchParams.set("callbackURL", callback.toString());

export default function ResetPasswordPreview() {
  return <ResetPasswordEmail url={url.toString()} />;
}
