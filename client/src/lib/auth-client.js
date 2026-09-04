import { createAuthClient } from "better-auth/react";
import { emailOTPClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
  fetchOptions: {
    credentials: "include",
  },
  // Login.jsx performs the redirect so the verification page mounts once.
  plugins: [emailOTPClient(), twoFactorClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
