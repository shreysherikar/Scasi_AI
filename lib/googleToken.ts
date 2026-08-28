// lib/googleToken.ts
//
// Extracted from the refreshGoogleAccessToken() logic already living inside
// app/api/auth/[...nextauth]/route.js, so both the web (cookie) session and
// the mobile (bearer JWT) session can refresh Google access tokens the same
// way. Feel free to delete the duplicate copy in the NextAuth route and have
// it import this instead.

export interface RefreshedGoogleToken {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<RefreshedGoogleToken> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error_description || data?.error || "Failed to refresh Google access token");
  }

  return data as RefreshedGoogleToken;
}
