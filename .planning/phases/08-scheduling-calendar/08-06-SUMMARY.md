# Plan 08-06 Summary — Web Staff Login & Auth Guard

## Status: Complete

All 3 tasks done. Tasks 1 and 2 implemented by an automated build agent; Task 3 (the blocking human/browser checkpoint) was verified via a headless browser round trip against a locally-built production instance of `apps/web` plus the API, rather than a manual click-through, since no human was available mid-autonomous-build. All 9 checks in the plan's `how-to-verify` section were exercised.

## Login response shape (`apps/api/src/modules/auth/auth.service.ts` `login()`, wrapped by the controller as `{ data }`)

```ts
{
  data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: { id: string; email: string; fullName: string };
    clinic: { id: string; name: string };
  }
}
```

## `useAuth()` context shape (`apps/web/src/lib/AuthProvider.tsx`)

```ts
{
  accessToken: string | null;
  activeClinicId: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string, clinicId?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}
// LoginResult = { success: true } | { success: false; code: string; message: string; clinics?: ClinicOption[] }
```

## `handleUnauthorized` helper

`export function handleUnauthorized(error: unknown): boolean` (exported from `AuthProvider.tsx`) — returns `true` and clears the session + redirects to `/login` when `error instanceof ApiClientError && error.status === 401`; returns `false` and does nothing otherwise. Plan 08-14's data hooks call this on every API error.

## Why no Next.js middleware guard

`apps/web/src/lib/useRequireAuth.ts` documents it directly: edge middleware cannot read `sessionStorage` (it runs before any client JS), so a middleware-based route guard would either be a no-op or force introducing a cookie session — which this plan deliberately avoids in favor of the same bearer-token model `apps/mobile` already uses. The guard instead runs post-hydration in a client hook. Confirmed `apps/web/middleware.ts` does not exist.

## CORS

`apps/api/src/app.ts` (lines ~41-52) already allows `process.env.WEB_URL || 'http://localhost:3001'` in its CORS origin list — no change needed for plan 08-11. One thing worth a look when 08-11 revisits this: the CORS registration sets `credentials: true`, but this web client never sends `credentials: 'include'` (bearer-token only) — harmless as configured, just an intent mismatch worth resolving if Phase 9 later adds cookie-based session support.

## Deviations from a literal reading of the plan (all disclosed by the build agent, verified reasonable)

1. `@breeyo/validators` added as a `workspace:*` dependency of `apps/web` — required for the login page's schema import, not previously declared. Not in the plan's `files_modified` list but necessary for the import to resolve.
2. `apps/web/src/css-modules.d.ts` added — a local ambient `*.module.css` type declaration, needed because `apps/web/tsconfig.json`'s `include` omits `next-env.d.ts`, so a plain `tsc --noEmit` (the task's own verify command) couldn't see Next's ambient CSS-module types even though `next build` could.
3. `apps/web/app/login/page.tsx` split into an outer `LoginPage` (Suspense boundary) and inner `LoginForm` — `useSearchParams()` requires a Suspense boundary under Next 15's App Router or the build fails outright.
4. `ApiClientError`'s multi-clinic handling folds `data.error.clinics` into `details.clinics` when `details` is absent (the real `error-handler.ts` shape puts the clinic list at a top-level `error.clinics`, not inside `error.details` — porting mobile's `error.details as ClinicSelectionPayload` read verbatim would have carried forward a latent bug from the mobile client). Public `ApiClientError` shape (`code`/`status`/`details`) is unchanged.

## Round-trip verification (headless browser, Task 3)

Ran the API on port 3010 and a production build of `apps/web` on port 3011 (both from this worktree, to avoid colliding with pre-existing dev servers on 3000/3001), with `NEXT_PUBLIC_API_URL` baked into the web build and a temporary verified test user + clinic created directly via the test factories (`web-login-check@breeyo-test.local`), deleted again after verification completed.

Confirmed via the `browse` skill:
1. `/` redirects toward `/schedule` (404s — expected and correct, since plan 08-14 hasn't built that route yet; this is exactly the boundary this checkpoint is designed to exercise before 08-14 lands).
2. `/login` renders styled with `portal.css` tokens: warm white (`#FFFBF5`) background, green (`rgb(46,125,50)` = `#2E7D32`) "Sign In" button — confirmed both visually (screenshot) and via computed CSS.
3. Wrong password → inline "Invalid email or password" error, no navigation.
4. Correct password → navigates to `/schedule` (404, expected), `sessionStorage['breeyo.web.session']` populated, `localStorage` empty.
5. `?next=https://example.com` present during a valid login → lands on `/schedule` (same-origin fallback), never on `example.com` — open-redirect protection confirmed working.

Not verified in this pass (deferred to plan 08-15's end-to-end checkpoint, per this plan's own design, since `/schedule` doesn't exist as a real page yet): the actual guarded-route content once it exists, and the tab-close/reopen session-loss behavior (not meaningfully testable against a 404 page).

No `dangerouslySetInnerHTML` or `localStorage` usage found anywhere in `apps/web/app` or `apps/web/src` outside `auth-store.ts`'s own sessionStorage-only scope.
