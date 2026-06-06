# RapBeat Analyzer Handoff

## Scope

This file documents only the RapBeat BPM/key analyzer.

## Current Analyzer Stack

- Docker-based analyzer service.
- Python analyzer script: `scripts/analyze-audio-key-bpm.py`.
- Warm HTTP service wrapper: `scripts/analyzer-server.py`.
- Node integration/cache helper: `src/lib/audio-analysis.ts`.
- Docker image: `docker/analyzer/Dockerfile`.
- Docker service: `analyzer` in `docker-compose.yml`.

## Analyzer Service

The analyzer is intended to run as a warm Docker service, not as one new container per beat.

Endpoints:

- `GET /health`
- `POST /analyze`
- `POST /analyze-bpm`
- `POST /analyze-key`

Useful env vars:

- `ENABLE_KEYFINDER=true|false`
- `ANALYZER_MODE=fast|full|debug`
- `ANALYZER_CONCURRENCY=2`
- `DISABLE_KEYFINDER_ANALYZER=true`
- `DISABLE_ANALYZER_SERVICE=true`

Default Docker build enables optional KeyFinder:

```bash
docker compose build analyzer
docker compose --profile tools up -d analyzer
```

Disable KeyFinder at build time:

```bash
ENABLE_KEYFINDER=false docker compose build analyzer
```

## KeyFinder

KeyFinder is optional and Docker-only.

Installed in the analyzer image when enabled:

- `mixxxdj/libkeyfinder`
- `evanpurkhiser/keyfinder-cli`

It is not a Next.js/app dependency.

Licensing note:

- `libkeyfinder` / `keyfinder-cli` are GPLv3-family projects.
- Keep them isolated in the analyzer container unless project licensing is reviewed.

## BPM Detection

The analyzer uses a consensus system, including:

- Essentia RhythmExtractor2013
- librosa beat tracking
- onset envelope autocorrelation
- tempogram peaks
- multi-band autocorrelation
- PLP / local pulse candidates
- low-end envelope pass
- percussive HPSS pass
- bar/arrangement grid scoring

Tempo handling:

- Half/double equivalence is preserved for judging.
- UI display chooses the most musically useful BPM.
- 1.5x / 2/3 triplet pulse relationships are detected.
- Rap-friendly display bands are preferred only with support.

Important final selection behavior:

- `65` is not automatically preferred over `130/135`.
- `90` remains valid and is not collapsed into `65`.
- `86` remains valid unless a supported `130` class is stronger.
- Filename BPM hints are accepted only when explicit, such as `135 bpm` or `140Bpm`.
- Plain beat numbers like `Beat65.mp3` are not treated as BPM hints.

## Key Detection

The analyzer combines:

- Essentia / HPCP
- harmonic chroma
- KeyFinder, if available
- explicit filename key hint, only as soft support

Keys are stored using sharps only:

```text
C C# D D# E F F# G G# A A# B
```

Certainty:

- `DETECTED`: supported by at least two independent sources.
- `POSSIBLE`: plausible but weak or not independently confirmed.
- `UNKNOWN`: too weak/ambiguous.

Strict judging should treat:

- `DETECTED`: normal key penalty allowed.
- `POSSIBLE`: soft penalty only.
- `UNKNOWN`: no harsh key penalty.

## Stored Metadata

RapBeat analysis stores:

- `detectedBpm`
- `bpmConfidence`
- `beatGridConfidence`
- `detectedKey`
- `detectedMode`
- `keyConfidence`
- `keyCertainty`
- `tuningCents`
- `referenceAHz`
- `bpmCandidatesJson`
- `keyCandidatesJson`
- `analysisStatus`
- `analysisSource`
- `analysisVersion`
- `audioHash`
- `analyzedAt`

Current analysis version:

```text
mir-v5.3-optional-keyfinder
```

## Commands

Analyze only new/dirty beats:

```bash
pnpm beats:analyze:new
pnpm beats:reanalyze:new
pnpm beats:reanalyze:dirty
```

Analyze one beat:

```bash
pnpm beats:analyze:file "partial name"
pnpm beats:reanalyze:file "partial name"
```

Debug one beat:

```bash
pnpm beats:debug "partial name"
```

Benchmark local expected examples:

```bash
pnpm beats:benchmark
```

Benchmark does not write expected values to the DB.

## Recently Verified Regression Results

```text
Beat65 -> 135 BPM, A# minor, DETECTED
Beat66 -> 90 BPM, B minor, DETECTED
lif3   -> 130 BPM, G minor, POSSIBLE
SCADI  -> 130 BPM, E minor, DETECTED
Beat61 -> 86 BPM, E minor, DETECTED
Beat63 -> 90 BPM, C major, DETECTED
```

Known benchmark caveat:

- Beat63 expected key reference is `A minor`, but analyzer currently selects `C major`.
- This is a relative major/minor relationship.
- It was not changed in the latest regression fix because the requested scope was BPM regressions and certainty guards, not a full key pipeline rewrite.

## Last Required Validation Run

These passed:

```bash
pnpm beats:reanalyze:file "Beat65"
pnpm beats:debug "Beat65"
pnpm beats:reanalyze:file "Beat66"
pnpm beats:debug "Beat66"
pnpm beats:reanalyze:file "lif3"
pnpm beats:debug "lif3"
pnpm beats:reanalyze:file "SCADI"
pnpm beats:debug "SCADI"
pnpm beats:benchmark
pnpm lint
pnpm build
```

## Performance Notes

Observed full-mode targeted analysis is usually around 40-70 seconds per beat on this machine.

The warm service avoids Docker rebuilds and avoids one container per beat, but the full MIR/key ensemble is still the bottleneck.

Use `ANALYZER_MODE=fast` for faster BPM-only/rough analysis paths when appropriate.
