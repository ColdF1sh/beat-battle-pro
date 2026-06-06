This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Storage Provider

Beat Battle Pro uses one S3-compatible storage abstraction for uploads and public audio playback. MinIO remains supported, and Cloudflare R2 can be enabled with environment variables only.

```bash
STORAGE_PROVIDER=minio
# or
STORAGE_PROVIDER=r2
```

MinIO uses:

```bash
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
S3_PUBLIC_URL=
S3_FORCE_PATH_STYLE=true
```

Cloudflare R2 uses:

```bash
R2_ACCOUNT_ID=
# or R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
R2_REGION=auto
```

Run the R2 health check:

```bash
pnpm r2:test
```

The command lists the bucket, uploads a temporary object, downloads it, verifies the public URL, deletes it, and prints success or failure.

## Rap Beat Analysis

Rap beat BPM/key analysis runs through the Docker analyzer service so Essentia stays inside Linux instead of the local Windows Python environment.

Build/run analysis for all local beats:

```bash
docker compose build analyzer
pnpm beats:analyze
```

Force refresh existing beat metadata:

```bash
pnpm beats:reanalyze
```

Inspect a single beat with BPM/key candidates and confidence diagnostics:

```bash
pnpm beats:debug Beat59.mp3
```

The analyzer reads local beats from `public/demo-audio/Global Library/Beat` through a read-only container mount at `/app/public/demo-audio`. If Docker or Essentia fails, the app falls back to the existing Python analyzer and keeps the battle flow running.

### Optional KeyFinder analyzer

The Docker analyzer can optionally include `libkeyfinder` plus `keyfinder-cli` as an external key-detection vote. This is Docker-only and is not required by the Next.js app. If it is unavailable or fails, the analyzer continues with the Essentia/chroma fallback path.

`libkeyfinder` and `keyfinder-cli` are GPLv3 projects, so keep this plugin isolated in the analyzer container unless the project license strategy explicitly allows broader GPL integration.

Build the analyzer with KeyFinder, which is the default when Docker can build the optional plugin:

```bash
docker compose build analyzer
```

Disable the optional KeyFinder plugin at build time:

```bash
ENABLE_KEYFINDER=false docker compose build analyzer
```

Disable KeyFinder at runtime even if the binary exists:

```bash
DISABLE_KEYFINDER_ANALYZER=true pnpm beats:debug Beat59.mp3
```

When enabled successfully, `pnpm beats:debug "BeatName"` shows the Essentia key candidates, harmonic/chroma candidates, KeyFinder key, final selected key, and the selection reason. KeyFinder is treated as one vote in the ensemble, not as absolute truth.

The analyzer is intended to run as a warm Docker service, so beat commands post work to the existing container instead of spawning a fresh container per file:

```bash
docker compose --profile tools up -d analyzer
```

Useful service endpoints are `GET /health`, `POST /analyze`, `POST /analyze-bpm`, and `POST /analyze-key`. Use `ANALYZER_MODE=fast|full|debug` and `ANALYZER_CONCURRENCY=2` (up to 4 on stronger machines) to tune local runs.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
