// lib/getSession.ts
//
// Drop-in replacement for `await getServerSession(authOptions)`.
// Every route that should also work from the Flutter app should call
// `await getSession(req)` instead. It returns the exact same shape
// NextAuth's session does ({ user, accessToken, provider, ... }) so no
// downstream code (orchestrator, Gmail/Calendar clients, etc.) needs to
// change — only the two lines at the top of each route.
//
// Resolution order:
//   1. Web: NextAuth session cookie (unchanged behavior).
//   2. Mobile: `Authorization: Bearer <token>` header, where <token> was
//      issued by POST /api/auth/mobile. The Google access token is minted
//      fresh from the stored refresh token on every call.

import { getServerSession, Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { verifyMobileToken } from "@/lib/mobileAuth";
import { refreshGoogleAccessToken } from "@/lib/googleToken";

export async function getSession(req: Request): Promise<Session | null> {
  const webSession = await getServerSession(authOptions);
  if (webSession) return webSession;

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  const payload = verifyMobileToken(token);
  if (!payload) return null;

  let accessToken: string | undefined;
  let error: string | undefined;
  try {
    const refreshed = await refreshGoogleAccessToken(payload.refreshToken);
    accessToken = refreshed.access_token;
  } catch (err) {
    console.warn("[getSession] Failed to refresh Google access token for mobile session:", err);
    error = "RefreshAccessTokenError";
  }

  // Cast to Session — this mirrors the shape NextAuth builds in its own
  // `session()` callback (see app/api/auth/[...nextauth]/route.js).
  return {
    user: { email: payload.email, name: payload.name, image: payload.image },
    accessToken,
    provider: payload.provider,
    error,
    expires: "", // unused by this codebase's routes, present only to satisfy the Session type
  } as unknown as Session;
}
