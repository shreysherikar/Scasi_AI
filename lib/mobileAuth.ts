// lib/mobileAuth.ts
//
// Issues and verifies the JWT the Flutter app uses in place of a NextAuth
// browser cookie. The JWT carries the user's Google *refresh* token (not the
// short-lived access token), so getSession() can mint a fresh Google access
// token on every request — mirroring what NextAuth's jwt() callback already
// does for the web app.
//
// Requires: npm install jsonwebtoken
//           npm install -D @types/jsonwebtoken

import jwt from "jsonwebtoken";

const MOBILE_JWT_SECRET = process.env.MOBILE_JWT_SECRET || process.env.NEXTAUTH_SECRET;

if (!MOBILE_JWT_SECRET) {
  // Fail loudly at boot rather than silently signing tokens with `undefined`.
  console.warn(
    "[mobileAuth] MOBILE_JWT_SECRET (or NEXTAUTH_SECRET) is not set. " +
      "Mobile auth will not work until one is configured in your environment."
  );
}

export interface MobileTokenPayload {
  email: string;
  name?: string;
  image?: string;
  refreshToken: string;
  provider: "google";
}

/** Sign a long-lived session token for the Flutter app to store and send as `Authorization: Bearer <token>`. */
export function signMobileToken(payload: MobileTokenPayload): string {
  if (!MOBILE_JWT_SECRET) throw new Error("MOBILE_JWT_SECRET is not configured");
  return jwt.sign(payload, MOBILE_JWT_SECRET, { expiresIn: "30d" });
}

/** Verify a bearer token from the Flutter app. Returns null if invalid/expired rather than throwing. */
export function verifyMobileToken(token: string): MobileTokenPayload | null {
  if (!MOBILE_JWT_SECRET) return null;
  try {
    return jwt.verify(token, MOBILE_JWT_SECRET) as MobileTokenPayload;
  } catch {
    return null;
  }
}
