# File Upload System — Backend

Express 5 + TypeScript (ESM) + Prisma 7 (`@prisma/adapter-pg`) + Postgres, backing the three upload strategies demoed in the sibling `file-upload-system-frontend` repo. See that repo's README for the full architecture diagram, strategy comparison, and the reasoning behind the resilience/design decisions below — this one stays focused on what's actually in this repo.

## API surface

All routes are mounted under `/api/uploads`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/single` | Traditional whole-file upload (multer memoryStorage, hashed + deduped, stored under `storage/traditional/<uploadId>/`) |
| POST | `/init` | Create/resume/dedupe a chunked-upload session by file hash |
| POST | `/chunk` | Upload one chunk (checksum-verified on arrival); merges + hash-verifies on the last chunk |
| GET | `/:uploadId/status` | Poll a chunked upload's status/progress |
| DELETE | `/:uploadId` | Abort a chunked upload (wipes its chunk files, marks it `FAILED`) |

Rate limits are route-specific (see `src/routes/upload.routes.ts`): tight on `/init` (session creation is cheap to abuse), loose on `/chunk` (a legitimate large upload makes many of these).

## Data model (`prisma/schema.prisma`)

- **`Upload` / `UploadChunk`** — the local chunked-upload flow. `Upload.fileHash` is unique (whole-file dedup); `UploadChunk.checksum` holds the per-chunk SHA-256 sent by the client, verified on arrival before the bytes are written to disk.

Traditional uploads get an `Upload` row too (`totalChunks: 1`), for the same dedup/tracking the other strategies have — the only strategy that didn't originally have any DB record.

## Setup

```bash
npm install
npx prisma migrate dev   # applies migrations against DATABASE_URL
npm run dev
```

Required env vars (`.env`): `DATABASE_URL` (Postgres), `PORT`.

`npm run cleanup:orphans` deletes uploads stuck in `NEW`/`UPLOADING`/`FAILED` for more than 24h (and their on-disk chunks). Run manually or wire it to a host cron entry — deliberately not scheduled in-process, since a single-instance demo gains nothing from that over a documented script and it adds real operational risk (no distributed lock) if ever scaled to multiple instances.
