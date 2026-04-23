-- ─────────────────────────────────────────────────────────
-- Video Translation DB Schema
-- ─────────────────────────────────────────────────────────

CREATE TYPE job_status AS ENUM (
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE IF NOT EXISTS translation_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status          job_status NOT NULL DEFAULT 'QUEUED',
  source_language VARCHAR(10) NOT NULL,
  target_language VARCHAR(10) NOT NULL,
  input_filename  TEXT NOT NULL,
  input_path      TEXT NOT NULL,
  output_path     TEXT,
  error_message   TEXT,
  progress        INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_translation_jobs_updated_at
  BEFORE UPDATE ON translation_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for fast status polling
CREATE INDEX idx_translation_jobs_status ON translation_jobs(status);
CREATE INDEX idx_translation_jobs_created_at ON translation_jobs(created_at DESC);