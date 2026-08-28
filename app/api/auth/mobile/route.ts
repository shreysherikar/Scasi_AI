// app/api/auth/mobile/route.ts
//
// POST { serverAuthCode: string }
// -> { token: string, user: { email, name, image } }
//
// The Flutter app signs in with GoogleSignIn(serverClientId: <your GOOGLE_CLIENT_ID>,
// scopes: [gmail.readonly, gmail.send, calendar.events, email, profile]), which
// gives it a one-time `serverAuthCode` (NOT the id token — the auth *code*).
// This route exchanges that code for Google tokens server-side, the same way
// a web OAuth redirect would, which is the only way to get a long-lived
// refresh_token out of a native Google Sign-In flow.
//
// Requires: npm install google-auth-library jsonwebtoken
//           npm install -D @types/jsonwebtoken
//
// Requires GOOGLE_CLIENT_ID to be configured as a "Web application" OAuth
// client in Google Cloud Console (the same one already used by NextAuth),
// and the Android/iOS OAuth client IDs to be registered in the same GCP
// project with the Web client ID set as GoogleSignIn's serverClientId.

import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { ensureUserExists } from "@/lib/supabase";
import { ensureUser } from "@/src/agents/rag/repository";
import { signMobileToken } from "@/lib/mobileAuth";
import type { Session } from "next-auth";

export const runtime = "nodejs";

// "postmessage" is the redirect_uri Google expects when exchanging an
// auth code obtained from a native/mobile Sign-In SDK rather than a web
// redirect flow.
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "postmessage"
);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const serverAuthCode = body?.serverAuthCode;

  if (!serverAuthCode || typeof serverAuthCode !== "string") {
    return NextResponse.json({ error: "serverAuthCode is required" }, { status: 400 });
  }

  let tokens;
  try {
    const result = await oauth2Client.getToken(serverAuthCode);
    tokens = result.tokens;
  } catch (err) {
    console.error("[auth/mobile] code exchange failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid or expired auth code" }, { status: 401 });
  }

  if (!tokens.id_token || !tokens.refresh_token) {
    return NextResponse.json(
      {
        error:
          "Google did not return a refresh token. In the Flutter app's GoogleSignIn config, " +
          "make sure serverClientId is set and this is the account's first consent " +
          "(revoke prior access at https://myaccount.google.com/permissions if testing repeatedly).",
      },
      { status: 400 }
    );
  }

  let payload;
  try {
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error("[auth/mobile] id_token verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to verify Google ID token" }, { status: 401 });
  }

  const email = payload?.email;
  if (!email) {
    return NextResponse.json({ error: "Google account has no email on the ID token" }, { status: 400 });
  }

  const name = payload?.name;
  const image = payload?.picture;

  // Reuse the exact provisioning logic the web app uses on sign-in.
  const pseudoSession = { user: { email, name, image } } as Session;
  try {
    const userId = await ensureUserExists(pseudoSession);
    await ensureUser(userId, email, name, image);
  } catch (err) {
    // Non-fatal, same as the web signIn() callback — LLM-only features still work.
    console.warn("[auth/mobile] user provisioning failed (non-fatal):", err instanceof Error ? err.message : err);
  }

  const token = signMobileToken({
    email,
    name: name ?? undefined,
    image: image ?? undefined,
    refreshToken: tokens.refresh_token,
    provider: "google",
  });

  return NextResponse.json({ token, user: { email, name, image } });
}
