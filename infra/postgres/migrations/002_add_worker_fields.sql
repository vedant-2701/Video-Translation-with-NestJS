-- ─────────────────────────────────────────────────────────
-- Migration 002 — Worker fields
--
-- Changes:
--   1. Add PENDING to job_status enum
--      (PENDING = upload initiated, presigned URL issued, file not yet in MinIO)
--      (QUEUED  = file confirmed in MinIO, ready for Colab to pick up)
--   2. Add current_stage VARCHAR — updated by Colab on each stage start/complete
--      Used by EventsService to emit a replay event on SSE reconnect
--   3. Add s3_input_key / s3_output_key — MinIO object keys (not local paths)
-- ─────────────────────────────────────────────────────────

-- 1. Add PENDING to enum (Postgres requires this order)
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'QUEUED';

-- 2. Add new columns
ALTER TABLE translation_jobs
    ADD COLUMN IF NOT EXISTS current_stage      VARCHAR(60),
    ADD COLUMN IF NOT EXISTS s3_input_key       TEXT,
    ADD COLUMN IF NOT EXISTS s3_output_key      TEXT,
    ADD COLUMN IF NOT EXISTS s3_subtitle_en_key TEXT,
    ADD COLUMN IF NOT EXISTS s3_subtitle_hi_key TEXT;

-- 3. input_path / output_path are now optional (MinIO uses s3_*_key instead)
--    Keep the columns for local-driver compatibility — just allow NULL
ALTER TABLE translation_jobs
    ALTER COLUMN input_path  DROP NOT NULL,
    ALTER COLUMN output_path DROP NOT NULL;