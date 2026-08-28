# Scasi Mobile Auth Patch

This adds Google Sign-In auth to your existing `Scasi-AI` Next.js backend so the
Flutter app can call the same API routes the web app uses (`/api/chat`,
`/api/db/emails`, `/api/ai/*`, `/api/calendar/events`) with a bearer JWT instead
of a browser cookie. **Nothing about your existing web app changes** — NextAuth
cookie sessions keep working exactly as before; mobile is additive.

## 1. Install new dependencies

```bash
npm install google-auth-library jsonwebtoken
npm install -D @types/jsonwebtoken
```

## 2. Copy files into your repo

Copy this patch folder's contents into your `Scasi-AI` repo root, preserving paths:

```
lib/mobileAuth.ts          (new)
lib/googleToken.ts         (new)
lib/getSession.ts          (new)
app/api/auth/mobile/route.ts   (new)
app/api/chat/route.ts          (replace)
app/api/db/emails/route.ts     (replace)
app/api/ai/triage/route.js     (replace)
app/api/ai/reply/route.js      (replace)
app/api/ai/summarize/route.js  (replace)
app/api/ai/compose/route.ts    (replace)
app/api/calendar/events/route.ts (replace)
app/api/check-session/route.js (replace)
```

Every replaced file changes only its session check: `getServerSession(authOptions)`
→ `getSession(req)`. Business logic is untouched.

## 3. Add an environment variable

```
# .env.local
MOBILE_JWT_SECRET=<a long random string, e.g. `openssl rand -hex 32`>
```

If you skip this, `getSession()` falls back to `NEXTAUTH_SECRET`, but a
dedicated secret is cleaner (lets you rotate mobile sessions independently of
web sessions).

## 4. Google Cloud Console setup

You already have a **Web application** OAuth client for NextAuth
(`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`). Reuse it — do not create a
second one for mobile.

1. In the same GCP project, create an **Android** OAuth client ID (package
   name + SHA-1 fingerprint of your debug/release keystore) and, if you'll
   ship iOS, an **iOS** OAuth client ID (bundle ID).
2. In the Flutter app, `GoogleSignIn` is configured with
   `serverClientId: <your Web client ID>` — this is what lets the native
   sign-in flow hand back a `serverAuthCode` your backend can redeem for a
   refresh token. The Android/iOS client IDs don't need to appear in app code;
   the Google Sign-In SDK finds them from the app's package name/bundle ID
   automatically.
3. Make sure the OAuth consent screen requests these scopes (same ones
   NextAuth already asks for on web):
   `openid email profile https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/calendar.events`

## 5. How the flow works end to end

```
Flutter: GoogleSignIn.signIn() → user consents → serverAuthCode
Flutter: POST /api/auth/mobile { serverAuthCode }
Backend: exchanges code for { id_token, refresh_token } via Google
Backend: verifies id_token, provisions user in Supabase (ensureUserExists)
Backend: signs a 30-day JWT containing { email, name, image, refreshToken }
Backend: → { token, user }
Flutter: stores token in flutter_secure_storage
Flutter: every request → Authorization: Bearer <token>
Backend: getSession(req) verifies the JWT, exchanges the stored refreshToken
         for a fresh Google access_token, builds a session object identical
         in shape to a NextAuth web session
```

## 6. Known limitation (documented, not hidden)

`getSession()` refreshes the Google access token on **every** mobile request
rather than caching it until it expires (~1hr). This is correct and simple,
but does one extra network round-trip to Google per API call. For a resume
project this is a fine tradeoff; a natural next improvement is caching the
`{ access_token, expires_at }` pair per user (e.g. in Supabase or an in-memory
LRU) and only refreshing when it's actually expired.
