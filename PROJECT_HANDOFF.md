# Beat Battle Pro Project Handoff

This file is a broad context handoff for ChatGPT or another coding agent. It intentionally covers the whole project at a high level. For deep RapBeat analyzer details, also read `ANALYZER_HANDOFF.md`.

## Project Snapshot

- Name: `beat-battle-pro`
- Stack: Next.js App Router, React 19, TypeScript, Prisma, PostgreSQL, NextAuth, Tailwind CSS, Playwright, Vitest.
- Package manager: `pnpm`
- App style direction: dark purple underground/graffiti/editorial game UI.
- Primary domain: competitive beatmaking and rap battles with matchmaking, battle rooms, uploads, anonymous voting, Elo, leaderboards, and profiles.
- Current storage abstraction: AWS SDK S3-compatible client in `src/lib/storage/s3.ts`, supporting MinIO and Cloudflare R2 via env.
- Audio analysis: Docker/Python analyzer for RapBeat BPM/key and submission rule compliance. See `ANALYZER_HANDOFF.md`.

## Important Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm prisma validate
pnpm prisma generate
pnpm prisma migrate dev
pnpm test:unit
pnpm test:e2e
pnpm r2:test
pnpm storage:test:minio
```

Audio analyzer commands:

```bash
docker compose build analyzer
pnpm beats:analyze
pnpm beats:analyze:new
pnpm beats:reanalyze
pnpm beats:reanalyze:new
pnpm beats:analyze:file "partial name"
pnpm beats:reanalyze:file "partial name"
pnpm beats:debug "partial name"
pnpm beats:benchmark
```

Dev cleanup:

```bash
pnpm db:cleanup:matchmaking
pnpm db:cleanup:dev-fake
```

## Directory Map

- `src/app`: Next.js App Router pages and API routes.
- `src/app/(app)`: authenticated app pages: battle, profile, leaderboard, messages, community, shop.
- `src/app/(auth)`: login/register pages.
- `src/app/api`: auth, matchmaking, battle lifecycle, submissions, voting, messages, leaderboard, dev routes.
- `src/components`: UI components grouped by domain.
- `src/components/battle`: battle room, timers, chat, voting, drafting, ready check, volume, dev tools.
- `src/components/audio`: waveform/audio player.
- `src/components/auth`: topbar/user menu/sign out.
- `src/components/profile`: profile cards, hover card, history, Elo charts, avatar upload.
- `src/components/ui`: shared design primitives.
- `src/lib`: server/domain logic.
- `src/lib/battle`: battle modes, transitions, drafting, voting, lifecycle, sound pack/rap beat prep.
- `src/lib/ranking`: Elo/rank config and battle Elo calculation.
- `src/lib/storage`: S3-compatible storage abstraction.
- `src/lib/sound-library`: local sound library scanning and generated battle packs.
- `src/lib/audio-analysis.ts`: Node helper for analyzer integration and caching.
- `scripts`: analyzer, beat analysis, storage tests, cleanup scripts.
- `prisma`: schema, migrations, seed.
- `tests`: Vitest unit tests and Playwright E2E tests.
- `public/demo-audio`: local demo/global audio library including rap beats.

## Pages

- `/`: redesigned home/hub page.
- `/login`, `/register`: auth screens.
- `/battle`: mode selection and matchmaking page.
- `/battle/[battleId]`: battle room.
- `/leaderboard`: Producer/Rap leaderboard tabs.
- `/profile`: redirects to current user profile.
- `/profile/[username]`: public profile.
- `/messages`, `/community`, `/shop`: supporting app pages.

## API Routes

Auth:

- `POST /api/auth/register`
- `/api/auth/[...nextauth]`

Matchmaking:

- `POST /api/matchmaking/search`
- `POST /api/matchmaking/cancel`
- `GET /api/matchmaking/status`

Battle lifecycle:

- `GET /api/battles/active`
- `POST /api/battles/[battleId]/ready`
- `POST /api/battles/[battleId]/sync-status`
- `POST /api/battles/[battleId]/heartbeat`
- `POST /api/battles/[battleId]/reconnect`
- `POST /api/battles/[battleId]/abandon`
- `POST /api/battles/[battleId]/leave`

Battle features:

- `GET/POST /api/battles/[battleId]/messages`
- `POST /api/battles/[battleId]/submission`
- `POST /api/battles/[battleId]/listening-complete`
- `POST /api/battles/[battleId]/vote`
- `GET/POST /api/battles/[battleId]/draft`

Downloads:

- `GET /api/generated-battle-packs/[generatedPackId]/download`
- `GET /api/sound-packs/[soundPackId]/download`

Dev helpers:

- `POST /api/dev/fake-matchmaking/fill`
- `POST /api/dev/battles/[battleId]/seed-fake-submissions`
- `POST /api/dev/battles/[battleId]/skip-phase`
- `POST /api/dev/fake-voting/auto-vote`

Other:

- `GET /api/leaderboard`
- `POST /api/profile/avatar`

## Battle Modes

Defined in `src/lib/battle/modes.ts`.

Active modes:

- `beatmaking_strict`
  - Category: beatmaking
  - 5 players
  - Drafting enabled
  - Drafts genre, BPM, key, duration
- `beatmaking_free_flying`
  - Category: beatmaking
  - 5 players
  - No drafting
  - 15 min
- `beatmaking_bullet`
  - Category: beatmaking
  - 5 players
  - No drafting
  - 5 min
- `rap_free_flying`
  - Category: rap
  - 5 players
  - One shared beat
  - Vocal submission
  - Anonymous rating

Rap Strict Rules was intentionally removed. Producer Strict Rules remains.

## Battle Status Flow

Enum: `BattleStatus`

```text
WAITING -> READY -> DRAFTING -> ACTIVE -> SUBMISSION -> VOTING -> FINISHED
```

`CANCELLED` exists for cancelled/closed battles.

Status details live in `src/lib/battle/status.ts`.

Core transition helpers live in `src/lib/battle/transitions.ts`:

- `maybeCancelExpiredReadyBattle`
- `maybeMoveBattleToSubmission`
- `maybeMoveBattleToVoting`
- `maybeStartVotingTimer`
- `maybeFinishBattle`
- `finishBattle`
- fake submission seeding helpers

`sync-status` calls transition helpers and is used by the client to advance timers safely.

## Battle Room UX

Main page: `src/app/(app)/battle/[battleId]/page.tsx`

Key components:

- `BattleTimer`
- `BattleStatusSync`
- `BattleHeartbeat`
- `BattleNavigationGuard`
- `BattleVolumeControl`
- `ReadyCheckPanel`
- `DraftingPanel`
- `VotingPanel`
- `BattleChatPanel`
- `SubmissionUploadForm`
- `SubmissionAudioPlayer`

Battle room behavior:

- Player sidebar remains non-anonymous and shows avatar, username, mode-specific Elo/rank or Not qualified, status, uploaded/voted state.
- Listening/voting track cards are anonymous: Track 1, Track 2, etc.
- Current user's own submission is played during mandatory listening but hidden from rating UI.
- Chat is full-width below battle content with stable height and internal scrolling.
- Battle settings gear was replaced by inline master volume.
- Leave/abandon uses confirmation UI and server-side abandon endpoint.

## Mandatory Listening and Voting

Component: `src/components/battle/voting-panel.tsx`

Client states:

- `LISTENING_NOT_STARTED`
- `LISTENING_PLAYING`
- `LISTENING_COMPLETING`
- `VOTING_READY`
- `VOTING_SUBMITTED`

Listening rules:

- Playlist includes all submitted tracks, including fake players and current user.
- Deterministic order: participant joined/slot order, fallback submission createdAt/id.
- Max playback per track: 50 seconds.
- App locks controls during mandatory listening.
- If autoplay is blocked, user sees Start listening.
- After final track, client calls `/api/battles/[battleId]/listening-complete` once.
- `listening-complete` is idempotent and starts voting timer.

Voting rules:

- Score rating is 1-10.
- Each voter rates every opponent submission.
- User cannot rate own track.
- Submit disabled until all opponent scores are selected.
- Backend model: `Vote` has one row per target submission per voter.
- Vote validation: `src/lib/battle/voting.ts`.
- Finish scoring aggregates totals/averages and applies rule penalties where relevant.

Fake voting:

- Dev only when `ENABLE_DEV_FAKE_PLAYERS=true`.
- Route: `/api/dev/fake-voting/auto-vote`.
- Fake votes do not rate own track.
- Recent fix: fake votes ignore abandoned/forfeited participants and upsert per target to avoid duplicate/race crashes.

## Strict Rules Drafting

Producer Strict Rules only.

Core files:

- `src/lib/battle/drafting/config.ts`
- `src/lib/battle/drafting/engine.ts`
- `src/lib/battle/drafting/service.ts`
- `src/components/battle/drafting-panel.tsx`

Categories:

- Genre
- BPM
- Key
- Duration

Draft behavior:

- Ban/veto flow until one option remains per category.
- Fake players can auto-ban in dev.
- Server helper `advanceDraftIfNeeded` progresses expired turns.
- Final rules are saved on `BattleDraft`.
- After all categories resolve, battle transitions to `ACTIVE`.

Note naming is sharp-only:

```text
C, C#, D, D#, E, F, F#, G, G#, A, A#, B
```

## Rap Battle Beat System

Rap battles use one shared beat instead of a generated drum/sound pack.

Core files:

- `src/lib/battle/sound-pack.ts`
- `src/lib/audio-analysis.ts`
- `src/components/battle/rap-beat-analysis-refresh.tsx`

Rap beats are represented by `RapBeat`.

Important fields:

- `fileUrl`
- `fileName`
- `detectedBpm`
- `bpmConfidence`
- `beatGridConfidence`
- `detectedKey`
- `detectedMode`
- `keyConfidence`
- `keyCertainty`
- `bpmCandidatesJson`
- `keyCandidatesJson`
- `analysisStatus`
- `analysisSource`
- `analysisVersion`
- `audioHash`
- producer metadata

Expected behavior:

- Rap beat is selected/attached early for rap battles.
- Battle creation should prefer already-analyzed beats.
- Rap beat visible only during `ACTIVE/Battle`, not submission/voting/results.
- Beat file name/title hidden from players.
- Beat card shows Producer, BPM, Key.
- Producer hover card is informational only during battle.

## Audio Analyzer

Detailed analyzer-specific notes are in `ANALYZER_HANDOFF.md`.

Short version:

- Docker-based Python analyzer.
- Essentia is primary analyzer.
- Fallback analyzer exists.
- Optional KeyFinder/libkeyfinder plugin can be built in Docker.
- Analyzer should never crash the app.
- Analyzer should prefer UNKNOWN/POSSIBLE over fake certainty.
- Strict Rules penalties use analyzer results with caps.

Important commands:

```bash
docker compose build analyzer
docker compose --profile tools up -d analyzer
pnpm beats:debug "BeatName"
pnpm beats:benchmark
```

## Storage

Storage abstraction: `src/lib/storage/s3.ts`

Provider switch:

```env
STORAGE_PROVIDER=minio
# or
STORAGE_PROVIDER=r2
```

MinIO env:

```env
S3_ENDPOINT=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
S3_PUBLIC_URL=
S3_FORCE_PATH_STYLE=true
```

R2 env:

```env
R2_ACCOUNT_ID=
# or R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
R2_REGION=auto
```

Notes:

- R2 can fall back to existing `S3_*` env for endpoint/credentials/bucket during migration.
- R2 still needs a real public `R2_PUBLIC_URL`; localhost MinIO URLs are rejected for R2 public playback.
- `pnpm r2:test` lists bucket, uploads a temporary WAV, downloads it, verifies public audio URL, deletes it.
- Startup storage logging is in `src/instrumentation.ts`.

Storage supports:

- Battle submission upload.
- Public browser playback via stored `fileUrl`.
- WaveSurfer waveform loading from `fileUrl`.
- Download links.
- Generated pack/sound pack downloads via API routes.

## Elo and Ranking

Core files:

- `src/lib/ranking/elo-config.ts`
- `src/lib/ranking/calculate-battle-elo.ts`
- `src/lib/battle/transitions.ts`

User has:

- Legacy `eloRating`
- `producerElo`, `producerWins`, `producerGames`
- `rapElo`, `rapWins`, `rapGames`

Rules:

- Producer battles use producer Elo/rank.
- Rap battles use rap Elo/rank.
- Topbar can show both if qualified.
- Unqualified shows Not qualified or compact `--`.
- Producer rank names include Producer, e.g. Bronze Producer I.
- Rap rank names use MC naming, e.g. Tin Foil MC III.
- Rap battles should not mutate producer stats.
- Producer battles should not mutate rap stats.

Abandon penalty:

- Fixed `-30` Elo for unfinished battles.
- Category-specific.
- Producer abandon affects `producerElo` only.
- Rap abandon affects `rapElo` only.
- If unqualified in that category, no weird 0 Elo is created.
- Idempotent via `leavePenaltyAppliedAt`.

Bullet Elo:

- Bullet uses special placement bases requested by user:
  - `21 / 13 / 5 / -13 / -21`

## Reconnect and Competitive Lifecycle

Core file: `src/lib/battle/competitive-lifecycle.ts`

Important fields on `BattleParticipant`:

- `presenceStatus`
- `lastSeenAt`
- `connectedAt`
- `disconnectedAt`
- `reconnectedAt`
- `reconnectExpiresAt`
- `abandonedAt`
- `abandonReason`
- `leavePenaltyAppliedAt`
- `leavePenaltyElo`

Presence enum:

```text
CONNECTED
DISCONNECTED
RECONNECTED
ABANDONED
```

Routes:

- `/api/battles/active`
- `/api/battles/[battleId]/heartbeat`
- `/api/battles/[battleId]/reconnect`
- `/api/battles/[battleId]/abandon`

Current behavior:

- Active battle lookup ignores abandoned participants.
- Reconnect rejects abandoned participants.
- Abandon is idempotent.
- Active match popup is compact corner UI.
- Popup can be locally dismissed per battle ID.
- Reconnect timeout sweeps are throttled in active lookup.

## Auth

Core files:

- `src/lib/auth.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/types/next-auth.d.ts`

Auth uses NextAuth with Prisma adapter and credentials/password flow.

Protected app layout is under `src/app/(app)`.

## Uploads and Audio Playback

Battle submissions:

- API route: `src/app/api/battles/[battleId]/submission/route.ts`
- Validates file with `src/lib/validations/upload.ts`.
- Uploads via `uploadAudioSubmission()` in `src/lib/storage/s3.ts`.
- Saves `BattleSubmission`.
- Updates participant `beatUrl`.
- Kicks background submission BPM/key analysis.

Audio player:

- `src/components/audio/submission-audio-player.tsx`
- Uses WaveSurfer.
- Has fallback audio element.
- Supports locked controls for mandatory listening.
- Supports hover preview.
- Uses global battle volume setting via `useAudioSettings`.

## Local Sound Library and Generated Packs

Core files:

- `src/lib/sound-library/local-library.ts`
- `src/lib/sound-library/generate-battle-pack.ts`
- `src/lib/battle/sound-pack.ts`

Producer battles use generated sound packs from the local/global library.

Rap battles use one `RapBeat`.

Generated pack downloads:

- `src/app/api/generated-battle-packs/[generatedPackId]/download/route.ts`

Sound pack downloads:

- `src/app/api/sound-packs/[soundPackId]/download/route.ts`

## Chat and Reactions

Battle chat:

- Component: `src/components/battle/battle-chat-panel.tsx`
- Route: `src/app/api/battles/[battleId]/messages/route.ts`
- Stable full-width panel below battle layout.
- Message list scrolls internally.
- Input/emoji/send controls stay visible.

Listening reactions:

- Implemented inside `VotingPanel`.
- Uses special message prefix `__reaction__:`.
- Polls battle messages and animates emoji over listening area.
- Same emojis as chat.

## Dev Fake Players

Enabled by:

```env
ENABLE_DEV_FAKE_PLAYERS=true
```

Routes:

- `/api/dev/fake-matchmaking/fill`
- `/api/dev/battles/[battleId]/seed-fake-submissions`
- `/api/dev/battles/[battleId]/skip-phase`
- `/api/dev/fake-voting/auto-vote`

Dev fake players generally use usernames beginning with:

```text
dev_fake_player_
```

Fake vote generation is score-based 1-10 and should not vote for self.

## Database Models to Know

Major models:

- `User`
- `Battle`
- `BattleParticipant`
- `BattleReadyCheck`
- `BattleMessage`
- `BattleListeningProgress`
- `GeneratedBattlePack`
- `GeneratedBattlePackSound`
- `RapBeat`
- `BattleDraft`
- `BattleDraftBan`
- `BattleEloResult`
- `BattleSubmission`
- `Vote`
- `SoundPack`
- `SoundPackSound`
- `MatchmakingQueue`

Important unique constraints:

- `BattleParticipant`: `@@unique([battleId, userId])`
- `BattleReadyCheck`: `@@unique([battleId, userId])`
- `BattleListeningProgress`: `@@unique([battleId, userId])`
- `BattleSubmission`: `@@unique([battleId, participantId])`
- `Vote`: `@@unique([battleId, voterId, participantId])`
- `BattleEloResult`: `@@unique([battleId, userId])`
- `MatchmakingQueue`: `@@unique([userId, mode, status])`

## Environment Variables

Required base:

```env
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
ENABLE_DEV_FAKE_PLAYERS=false
```

Storage:

```env
STORAGE_PROVIDER=minio|r2
S3_ENDPOINT=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
S3_PUBLIC_URL=
S3_FORCE_PATH_STYLE=
R2_ACCOUNT_ID=
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
R2_REGION=auto
```

Analyzer-related env may include:

```env
ANALYZER_MODE=fast|full|debug
ANALYZER_CONCURRENCY=2
DISABLE_KEYFINDER_ANALYZER=true|false
```

See `ANALYZER_HANDOFF.md` for more.

## Testing

Unit tests:

- `tests/unit/competitive-lifecycle.test.ts`
- `tests/unit/battle-transitions.test.ts`
- `tests/unit/voting.test.ts`
- `tests/unit/ranking.test.ts`
- `tests/unit/matchmaking-rules.test.ts`
- validation/rate-limit/access-control tests

E2E tests:

- `tests/e2e/auth.spec.ts`
- `tests/e2e/battle-ui.spec.ts`
- `tests/e2e/matchmaking.spec.ts`
- `tests/e2e/voting-results-elo.spec.ts`
- `tests/e2e/leaderboard-profile.spec.ts`
- `tests/e2e/submissions-waveform.spec.ts`
- `tests/e2e/old-battle-safety.spec.ts`
- `tests/e2e/security.spec.ts`

Recently updated important validation:

```bash
pnpm exec vitest run tests/unit/competitive-lifecycle.test.ts tests/unit/battle-transitions.test.ts tests/unit/voting.test.ts
pnpm exec playwright test tests/e2e/voting-results-elo.spec.ts --project=chromium
pnpm lint
pnpm build
```

## Known Recent Fixes

- Rap Strict Rules removed; rap battle only has Free Flying.
- Rap beat card shows beat only during battle phase.
- Rap modes use rap Elo/rank, not producer Elo.
- Voting changed from podium 1st/2nd/3rd to 1-10 scoring.
- Voting has mandatory listening before rating.
- Listening has 50-second max per track.
- Anonymous track labels during listening/voting.
- Results reveal identities.
- Fake votes converted to 1-10 score votes.
- Abandon penalty fixed to category-specific -30 and no Elo reset to 0.
- Active reconnect popup made compact and idempotent.
- Chat restored to full-width stable-height layout.
- Yellow/gold button accents replaced with purple/fuchsia.
- Cloudflare R2 provider support added behind S3 abstraction.

## Known Caveats / Watch Points

- The repo has many untracked files in current local state; use `git status --short` carefully and avoid reverting user work.
- `.env.example` may lag current R2 env behavior; check `README.md` and `src/env.ts`.
- `pnpm r2:test` currently requires a valid public `R2_PUBLIC_URL`; it rejects localhost MinIO public URLs for R2.
- First Next dev loads can be slow due to compilation. Dev-only timing logs exist for battle page, profile page, active battle lookup, leaderboard, messages, sync-status, and fake vote generation.
- Analyzer work is complex and should be handled using `ANALYZER_HANDOFF.md`.
- Do not run slow audio analysis inside Prisma transactions.
- Do not call recursive status routes or create tight polling/refresh loops.
- Battle finish/Elo processing must remain idempotent (`eloProcessed`, unique `BattleEloResult`).
- Abandon must remain idempotent (`leavePenaltyAppliedAt`).
- Vote creation should remain duplicate-safe per `[battleId, voterId, participantId]`.

## Recommended Onboarding Path for a New Agent

1. Read this file.
2. Read `ANALYZER_HANDOFF.md` only if touching RapBeat/audio analysis.
3. Inspect `src/lib/battle/modes.ts`, `src/lib/battle/transitions.ts`, and `src/app/(app)/battle/[battleId]/page.tsx`.
4. For storage work, inspect `src/lib/storage/s3.ts` and `scripts/test-r2-storage.ts`.
5. For voting issues, inspect `src/components/battle/voting-panel.tsx`, `src/app/api/battles/[battleId]/vote/route.ts`, and `src/lib/battle/voting.ts`.
6. For Elo issues, inspect `src/lib/ranking/calculate-battle-elo.ts`, `src/lib/ranking/elo-config.ts`, and `finishBattle` in transitions.
7. Run targeted tests before broad changes.
