import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    passkeyClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        const search = window.location.pathname === "/login" ? window.location.search : "";
        window.location.href = `/2fa${search}`;
      },
    }),
  ],
});
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  updateUser,
  changeEmail,
  changePassword,
  deleteUser,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  useListPasskeys,
  twoFactor,
} = authClient;
