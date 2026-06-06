# Dev Fake Matchmaking Fix

Timestamp: 2026-05-16

## Root Cause

The failing `Find Battle` request was caused by a stale authenticated browser session after the local PostgreSQL development database was recreated. The session contained a user id that no longer existed in the database, so `/api/matchmaking/search` attempted to create `MatchmakingQueue` rows for a missing user and hit the `MatchmakingQueue_userId_fkey` foreign key constraint.

## Fixes

- Added a database existence check to `requireCurrentUser()` so stale sessions return a clear `401`:
  `"Your session is no longer valid. Please log in again."`
- Kept `/api/matchmaking/search` returning JSON errors for all unexpected failures.
- Added a specific fallback for Prisma `P2003` queue/user foreign-key failures.
- Improved the dev fake-player disabled message:
  `"Dev fake players are disabled. Set ENABLE_DEV_FAKE_PLAYERS=true and restart dev server."`
- Verified Prisma schema/database sync for:
  - `BattleStatus.READY`
  - `BattleDraft`
  - `BattleReadyCheck`
  - `BattleMessage`
  - `BattleParticipant.forfeited`
  - `BattleParticipant.missedSubmission`
  - `BattleParticipant.technicalLoss`
  - `BattleParticipant.leftAt`
  - `Battle.submissionStartedAt`
  - `Battle.submissionEndsAt`

## Files Changed

- `src/lib/api/access-control.ts`
- `src/app/api/matchmaking/search/route.ts`
- `src/app/api/dev/fake-matchmaking/fill/route.ts`
- `src/components/battle/battle-page-client.tsx`

## Commands Run

- `pnpm prisma format`
- `pnpm prisma validate`
- `pnpm prisma migrate dev`
- `pnpm prisma generate`
- `pnpm lint`
- `pnpm build`

## Verification Result

Browser automation verified:

1. Registered a fresh test user.
2. Logged in.
3. Opened `/battle`.
4. Selected Bullet.
5. Clicked GO.
6. Searching state appeared.
7. Clicked `DEV ONLY - Fill with fake players`.
8. Redirected to `/battle/[battleId]`.
9. Battle room loaded with 5 participants.
10. Ready check was visible.
11. Clicking Ready transitioned Bullet to ACTIVE.
12. ACTIVE sound pack UI appeared with `Download full pack`.

Latest verified battle:

- `http://localhost:3000/battle/cmp8ftuju0017ws9on4bk6och`

Result: PASS
