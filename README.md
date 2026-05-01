# Video Translation with NestJS

A full-stack video translation platform that automatically transcribes, translates, and synthesizes speech for multilingual video content. Built with NestJS (backend), Next.js (frontend), and AI-powered Python pipeline (worker).

**Stack:** faster-whisper (STT + VAD) → Sarvam AI (Translation) → OmniVoice (Voice Cloning TTS) → FFmpeg (Assembly)

---

## 🎯 Overview

This system provides end-to-end video translation capabilities:

- **Upload videos** via a user-friendly web interface
- **Automatic speech-to-text** extraction with VAD (voice activity detection)
- **Neural machine translation** to target language (supports 100+ language pairs)
- **Voice cloning TTS** that preserves the original speaker's voice characteristics
- **Subtitle generation** (WebVTT + embedded MP4 tracks)
- **Asynchronous job processing** with real-time progress tracking

### Key Features

✅ **Real-time Progress Tracking** – SSE-based live updates on transcription, translation, and synthesis
✅ **Voice Cloning** – OmniVoice generates speech in target language using reference chunk from original
✅ **Subtitle Tracks** – Dual-language subtitles (soft-embedded in MP4 + separate WebVTT files)
✅ **Presigned Upload/Download** – Direct browser uploads to S3/MinIO, no server-side file handling
✅ **Scalable Worker Architecture** – Offload processing to isolated workers (e.g., Google Colab with T4 GPU)
✅ **Database + Cache** – PostgreSQL for job state, Redis for pubsub and rate limiting

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Web Frontend                      │
│          (Upload, Progress Tracking, Download)               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTP + SSE
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    NestJS API Server                         │
│  ┌─────────────────────────────────────────────────────────┤
│  │ • Job Management (create, status, download)             │
│  │ • Video Upload (presigned URLs → S3/MinIO)              │
│  │ • Real-time Events (SSE channel per job)                │
│  │ • Worker Registration & Health Checks                   │
│  │ • Database: PostgreSQL (job state, metadata)            │
│  │ • Cache: Redis (pubsub, rate limiting)                  │
│  └─────────────────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │ Job Queue    │ Events       │ Worker API
        │ (BullMQ)     │ (Redis PubSub)
        │              │              │
┌───────▼────────┐ ┌──▼─────────┐ ┌─▼──────────────┐
│   Redis Queue  │ │  Redis     │ │ Worker Endpoints│
│  (job polling) │ │ Subscribers│ │ (progress,     │
│                │ │ (live SSE) │ │  complete)     │
└────────────────┘ └────────────┘ └────────────────┘
        │
        │ Poll /api/worker/next-queued
        │
┌───────▼──────────────────────────────────────────────────────┐
│              Python Pipeline (Worker)                         │
│   Runs on isolated GPU (e.g., Google Colab T4)               │
│  ┌────────────────────────────────────────────────────────┤
│  │ Stage 1: Extract Audio (FFmpeg → 24kHz WAV)            │
│  │ Stage 2: Transcribe (faster-whisper + VAD)             │
│  │ Stage 3: Translate (Sarvam AI)                         │
│  │ Stage 4: Synthesize (OmniVoice voice cloning)          │
│  │ Stage 5: Assemble Audio (overlay on master track)      │
│  │ Stage 6: Generate Subtitles (WebVTT → SRT)            │
│  │ Stage 7: Merge Video (embed audio + subtitle tracks)   │
│  └────────────────────────────────────────────────────────┘
        │
        │ Download input, upload output → S3/MinIO
        │
┌───────▼─────────────────────────────────────────────────────┐
│                   S3 / MinIO Storage                         │
│  uploads/          – input videos                            │
│  outputs/          – translated videos + subtitles          │
└────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Backend (NestJS)
- **Framework:** NestJS 11 (TypeScript)
- **Database:** PostgreSQL 16 (job metadata, status)
- **Cache/Queue:** Redis + BullMQ (job queue, pubsub for SSE)
- **Storage:** AWS S3 / MinIO (presigned uploads/downloads)
- **Logging:** Pino (structured, performant)

### Frontend (Next.js)
- **Framework:** Next.js 16 with App Router
- **Styling:** Tailwind CSS 4
- **HTTP:** Axios
- **Components:** Video upload, progress tracker, language selector

### Pipeline (Python)
- **Audio Extraction:** FFmpeg
- **Speech-to-Text:** faster-whisper (Whisper model with CTransformer backend)
- **Voice Activity Detection:** Silero VAD (built into faster-whisper)
- **Machine Translation:** Sarvam AI (`mayura:v1` or `sarvam-translate:v1`)
- **Text-to-Speech:** OmniVoice (voice cloning, 24kHz output)
- **Assembly:** PyDub, torchaudio, NumPy
- **HTTP:** requests

---

## 📋 Prerequisites

### Local Development
- **Node.js** 18+ (NestJS + Next.js)
- **Python** 3.10+ (pipeline)
- **Docker + Docker Compose** (PostgreSQL, Redis)
- **FFmpeg + FFprobe** (audio/video processing)
- **git** (optional, for version control)

### API Keys & Credentials
- **Sarvam AI API Key** – [Get here](https://console.sarvam.ai) (`SARVAM_API_KEY`)
- **AWS S3 or MinIO** – For storage (access key, secret, bucket)
- **ngrok** (optional) – For exposing local API to worker (free tier OK)

### GPU (for worker)
- **CUDA-capable GPU** (NVIDIA T4 or better)
- **CUDA 12+ Toolkit + cuDNN**
- **OR use Google Colab T4** (easiest, no setup)

---

## 🚀 Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/Video-Translation-with-NestJS.git
cd Video-Translation-with-NestJS
```

### 2. Set Up Environment

#### Backend (.env)
```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:
```env
# Postgres
DATABASE_URL=postgresql://postgres:password@localhost:5432/video_translation

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Storage (S3 or MinIO)
STORAGE_DRIVER=s3  # or 'minio' or 'local'
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
AWS_S3_BUCKET=video-translation-bucket

# NestJS
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3001
MAX_FILE_SIZE_MB=500

# AI APIs
SARVAM_API_KEY=sk_xxx
```

#### Frontend (.env.local)
```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

### 3. Start Infrastructure (Docker)
```bash
docker-compose up -d
```

Wait for health checks:
```bash
docker-compose ps
```

### 4. Install & Run Backend
```bash
cd apps/api
npm install
npm run start:dev
```

Backend runs on http://localhost:3000

### 5. Install & Run Frontend
```bash
cd apps/web
npm install
npm run dev
```

Frontend runs on http://localhost:3001

### 6. Set Up Worker (Google Colab)

1. Open the Jupyter notebook: `main_video_translation_pipeline.ipynb`
2. Upload to Google Colab
3. Set runtime to **GPU (T4)**
4. Configure secrets:
   ```
   SARVAM_API_KEY = sk_xxx
   NESTJS_URL = https://abc123.ngrok-free.dev  # your exposed API URL
   WORKER_SECRET = your-secret-from-.env
   ```
5. Run cells 1–2 to install dependencies
6. Run cell E (worker polling loop) – it will continuously poll for jobs

---

## 🔧 Configuration

### Environment Variables (Complete Reference)

#### Database
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | – | PostgreSQL connection string |
| `POSTGRES_USER` | `postgres` | DB user |
| `POSTGRES_PASSWORD` | `password` | DB password |
| `POSTGRES_DB` | `video_translation` | DB name |

#### Cache & Queue
| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | – | Optional Redis password |

#### Storage
| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_DRIVER` | `local` | `s3`, `minio`, or `local` |
| `AWS_REGION` | `us-east-1` | AWS region (S3 only) |
| `AWS_ACCESS_KEY_ID` | – | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | – | AWS secret key |
| `AWS_S3_BUCKET` | – | S3 bucket name |
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO server |
| `MINIO_ACCESS_KEY` | – | MinIO access key |
| `MINIO_SECRET_KEY` | – | MinIO secret key |
| `MINIO_BUCKET` | – | MinIO bucket name |
| `STORAGE_LOCAL_PATH` | `./storage` | Local disk path |

#### AI APIs
| Variable | Default | Description |
|----------|---------|-------------|
| `SARVAM_API_KEY` | – | **Required** Sarvam AI key |
| `VOICEBOX_URL` | – | Optional Voicebox TTS endpoint |
| `VOICEBOX_ENGINE` | – | Voicebox engine name |

#### API Server
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | NestJS listen port |
| `NODE_ENV` | `development` | `development` or `production` |
| `CORS_ORIGIN` | `http://localhost:3001` | CORS allowed origin |
| `MAX_FILE_SIZE_MB` | `500` | Max upload size in MB |

#### Worker
| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_SECRET` | – | Secret header for worker auth (`X-Worker-Secret`) |

---

## 📡 API Endpoints

### Upload & Jobs

#### `POST /api/upload/init`
Initialize video upload (returns presigned PUT URL).

**Request:**
```json
{
  "filename": "myvideo.mp4",
  "fileSizeMb": 120,
  "sourceLanguage": "en-IN",
  "targetLanguage": "hi-IN"
}
```

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadUrl": "https://s3.amazonaws.com/...presigned-put-url..."
}
```

#### `POST /api/upload/confirm`
Confirm video upload and queue translation job.

**Request:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "QUEUED"
}
```

#### `GET /api/jobs/{jobId}`
Get job status and metadata.

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PROCESSING",
  "progress": 45,
  "sourceLanguage": "en-IN",
  "targetLanguage": "hi-IN",
  "inputFilename": "myVideo.mp4",
  "downloadReady": false,
  "createdAt": "2024-12-01T10:30:00Z",
  "updatedAt": "2024-12-01T10:32:15Z"
}
```

#### `GET /api/download/{jobId}`
Get presigned download URL for completed video.

**Response:**
```json
{
  "downloadUrl": "https://s3.amazonaws.com/...presigned-get-url...",
  "filename": "myVideo_translated_hi-IN.mp4"
}
```

### Real-time Events

#### `GET /api/events/{jobId}`
Subscribe to job progress via **Server-Sent Events (SSE)**.

**Usage (JavaScript):**
```javascript
const eventSource = new EventSource(`/api/events/${jobId}`);
eventSource.onmessage = (e) => {
  const { progress, stage, message } = JSON.parse(e.data);
  console.log(`${stage}: ${progress}% - ${message}`);
};
eventSource.onerror = () => eventSource.close();
```

**Event Data:**
```json
{
  "progress": 45,
  "stage": "stage_3_translate",
  "message": "Translating 12/28 segments"
}
```

### Worker Endpoints (Internal)

These are called by the worker and require `X-Worker-Secret` header.

#### `GET /api/worker/next-queued`
Poll for next queued job.

**Response (204 if none):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "sourceLanguage": "en-IN",
  "targetLanguage": "hi-IN",
  "inputFilename": "myVideo.mp4"
}
```

#### `POST /api/worker/{jobId}/progress`
Report progress during processing.

**Request:**
```json
{
  "progress": 65,
  "stage": "stage_4_tts",
  "message": "Synthesizing speech"
}
```

#### `POST /api/worker/{jobId}/complete`
Mark job complete and provide output S3 keys.

**Request:**
```json
{
  "s3OutputKey": "outputs/550e8400-e29b-41d4-a716-446655440000-output.mp4",
  "s3SubtitleEnKey": "outputs/550e8400-e29b-41d4-a716-446655440000-subtitles-en.vtt",
  "s3SubtitleHiKey": "outputs/550e8400-e29b-41d4-a716-446655440000-subtitles-hi.vtt"
}
```

#### `POST /api/worker/{jobId}/fail`
Mark job as failed with error message.

**Request:**
```json
{
  "errorMessage": "CUDA out of memory"
}
```

---

## 🎬 Pipeline Stages (Worker)

The Python pipeline runs 7 stages sequentially:

### Stage 1: Extract Audio
- Extracts audio from video using FFmpeg
- Resamples to **24 kHz** mono PCM WAV
- **Output:** `extracted_audio.wav`

### Stage 2: Transcribe + Segment
- Uses **faster-whisper** (medium.en model) + **Silero VAD**
- VAD detects speech boundaries (silence gaps = 400ms)
- Returns phrase-level segments with timestamps
- **Selects reference chunk:** Finds best 3–10s window of speech
- **Fail-fast guards:**
  - No speech detected → `SilentAudioError`
  - Transcript < 10 chars → `TranscriptTooShortError`
  - No valid ref chunk → `NoValidReferenceChunkError`
- **Output:** Segment list + `ref_chunk.wav` + `ref_chunk_text`

### Stage 3: Translate
- Uses **Sarvam AI** (mayura or sarvam-translate model)
- Packs segments with `|||SEG_N|||` delimiters
- Batches at 1000 or 2000 char limit (per model)
- Parses response by splitting on delimiter
- **Fail-fast:** If segment count mismatches → abort
- **Output:** `segment.translated` field populated

### Stage 4: Synthesize (OmniVoice TTS)
- Generates speech for each translated segment
- **Voice cloning:** Uses `ref_chunk.wav` + `ref_chunk_text` as reference
- **Duration pinning:** Passes `segment.duration` so generated audio fits the original time slot
- **Postprocessing:** Removes trailing silence automatically
- **Sanity check:** If actual duration > 1.25× slot duration → truncate (data integrity)
- **Output:** `segment.audio` tensor (shape `(1, T)`, 24kHz, float32)

### Stage 5: Assemble Audio
- Creates silent master track (video duration at 24kHz)
- Overlays synthesized audio at segment timestamps
- Fills gaps with synthetic room tone (–40 dBFS, imperceptible)
- Handles TTS failures gracefully (leaves silence in failed slots)
- **Output:** `master_audio.wav`

### Stage 6: Generate Subtitles
- Creates **WebVTT** subtitle files (English + target language)
- Timestamps from segment boundaries
- **Output:** `subtitles_en.vtt`, `subtitles_hi.vtt`

### Stage 7: Merge Video
- Converts VTT → SRT (for MP4 mov_text codec)
- Embeds both subtitle tracks (soft, not burned-in)
- Replaces audio with `master_audio.wav`
- Uses FFmpeg with:
  - `-c:v copy` (no video re-encode, instant)
  - `-c:a aac` (audio codec)
  - `-c:s mov_text` (subtitle codec for MP4)
- Sets track metadata (language = eng/hin, titles)
- EN subtitles shown by default; user can toggle
- **Output:** `{stem}_translated_{target_language}.mp4`

---

## 📦 Database Schema

### translation_jobs Table
```sql
CREATE TABLE translation_jobs (
  id              UUID PRIMARY KEY,
  status          job_status ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'),
  source_language VARCHAR(10),       -- e.g., 'en-IN'
  target_language VARCHAR(10),       -- e.g., 'hi-IN'
  input_filename  TEXT,              -- original filename
  input_path      TEXT,              -- s3://bucket/uploads/...
  output_path     TEXT,              -- s3://bucket/outputs/...
  error_message   TEXT,              -- populated if FAILED
  progress        INTEGER (0–100),   -- current progress %
  created_at      TIMESTAMPTZ,       -- job creation time
  updated_at      TIMESTAMPTZ        -- last update (auto)
);

-- Indexes
CREATE INDEX idx_translation_jobs_status ON translation_jobs(status);
CREATE INDEX idx_translation_jobs_created_at ON translation_jobs(created_at DESC);
```

---

## 🐳 Docker Compose Services

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: 5432:5432
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck: pg_isready check

  redis:
    image: redis/redis-stack:latest
    ports: 6379:6379
    volumes:
      - redis_data:/data
    healthcheck: redis-cli ping
```

Start all services:
```bash
docker-compose up -d
```

Stop:
```bash
docker-compose down
```

---

## 🤖 Running the Worker (Google Colab)

### Setup

1. **Open notebook:** Upload `main_video_translation_pipeline.ipynb` to Google Colab
2. **Set GPU:** Runtime → Change runtime type → T4 GPU
3. **Configure secrets:**
   ```
   SARVAM_API_KEY = sk_xxx
   NESTJS_URL = https://your-ngrok-url.ngrok-free.dev
   WORKER_SECRET = your-worker-secret-from-.env
   ```

### Run Worker Loop

Execute **Cell 1-2** (installs) and **Cell E** (worker loop):

```python
# Cell E polls your API every 10s for jobs
# Stops with the Colab interrupt button (■)
```

**What happens:**
1. Polls `/api/worker/next-queued` every 10s
2. Downloads input video from S3 presigned URL
3. Runs 7-stage pipeline (∼5–15 min depending on video length + GPU)
4. Reports progress to `/api/worker/{jobId}/progress`
5. Uploads output MP4 + VTT files to S3
6. Marks complete with `/api/worker/{jobId}/complete`
7. Loops back to step 1

---

## 🌐 Exposing Local API to Worker

If worker is on Colab, expose your local API via **ngrok**:

```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com

# Expose port 3000 (NestJS)
ngrok http 3000
```

**Output:**
```
Forwarding                    https://abc123.ngrok-free.dev -> http://localhost:3000
```

Set `NESTJS_URL=https://abc123.ngrok-free.dev` in Colab secrets.

---

## 🧪 Testing

### Backend Tests
```bash
cd apps/api

# Unit tests
npm test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

### Manual API Testing

```bash
# Upload & translate
curl -X POST http://localhost:3000/api/upload/init \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "sample.mp4",
    "fileSizeMb": 50,
    "sourceLanguage": "en-IN",
    "targetLanguage": "hi-IN"
  }'

# Check job status
curl http://localhost:3000/api/jobs/{jobId}

# Subscribe to events
curl http://localhost:3000/api/events/{jobId}
```

---

## 📊 Performance & Limits

| Metric | Default | Notes |
|--------|---------|-------|
| Max upload size | 500 MB | Configurable via `MAX_FILE_SIZE_MB` |
| Segment batch size | 1000–2000 chars | Depends on translation model |
| Reference chunk | 3–10s | OmniVoice sweet spot for voice cloning |
| Timeout: SSE | 5 min | Browser disconnect after inactivity |
| Job retention | 30 days | Configurable cleanup job (see job-cleanup.service.ts) |
| Worker poll interval | 10s | Configurable in worker loop |
| Max concurrent workers | Unlimited | Controlled by job queue depth |

---

## 🛡️ Security

### Authentication
- **Worker authentication:** `X-Worker-Secret` header (required for all `/api/worker/*` endpoints)
- **User authentication:** Not implemented (add JWT if multi-tenant required)

### Secrets
- Never commit `.env` files – use `.env.example` as template
- Store `SARVAM_API_KEY` in Google Colab Secrets (Copilot integration)
- Rotate `WORKER_SECRET` periodically

### File Upload
- Validated file size limit (`MAX_FILE_SIZE_MB`)
- Presigned URLs are time-limited (1 hour default)
- Files stored in S3/MinIO, not on server disk

---

## 🐛 Troubleshooting

### Worker polls but finds no jobs
**Symptom:** Worker logs ".", API responds 204 (no content)

**Causes:**
- No jobs queued – upload a video first via web UI
- Wrong `NESTJS_URL` or `WORKER_SECRET` – check Colab secrets
- API not reachable – verify ngrok URL is live

**Fix:**
```bash
# Check job status manually
curl http://your-api/api/jobs/{jobId}

# Verify worker secret matches .env
echo $WORKER_SECRET
```

### "Published to 0 subscribers" in logs
**Symptom:** SSE client connects but receives no events

**Cause:** Worker finished stages before SSE subscription completed (or worker failed)

**Fix:** See [RxJS Observable Cleanup Pattern](https://your-docs) – the events service now uses `finalize()` operator to handle unsubscriptions gracefully.

### OmniVoice TTS fails: "CUDA out of memory"
**Symptom:** Worker crashes during Stage 4

**Causes:**
- Model too large for GPU VRAM
- Unloaded Whisper model is still in memory

**Fix:**
1. Call `whisper_stage.unload()` after Stage 2 (notebook does this)
2. Reduce `omnivoice_num_step` from 64 → 32 (faster, slightly lower quality)
3. Use larger GPU (A100 > T4)

### Video plays but has no audio
**Symptom:** Downloaded MP4 has audio track but no sound

**Causes:**
- Audio extraction failed silently
- Master audio is all zeros (assembly failed)

**Fix:**
```bash
# Inspect MP4 with FFprobe
ffprobe -v error -select_streams a output.mp4

# Check audio levels
ffmpeg -i output.mp4 -af "volumedetect" -f null -
```

### Subtitles not showing in player
**Symptom:** Player doesn't display subtitles even though VTT files exist

**Causes:**
- MP4 subtitle tracks not embedded (FFmpeg command failed)
- Player doesn't support mov_text codec
- Track language not set correctly

**Fix:**
```bash
# Check if subtitles are embedded
ffprobe -v error -select_streams s output.mp4

# Verify track metadata
ffmpeg -i output.mp4 -t 0 -v verbose 2>&1 | grep -i subtitle
```

### Redis connection refused
**Symptom:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Cause:** Redis not running

**Fix:**
```bash
# Start Docker Compose
docker-compose up -d redis

# Or verify Redis is listening
redis-cli ping  # should respond with PONG
```

### Database migration failed
**Symptom:** Cannot connect to PostgreSQL, or tables don't exist

**Cause:** Docker Compose didn't run init.sql

**Fix:**
```bash
# Reset DB volume and reinit
docker-compose down -v
docker-compose up -d postgres

# Manually run init script
psql $DATABASE_URL -f infra/postgres/init.sql
```

---

## 📚 Project Structure

```
Video-Translation-with-NestJS/
├── apps/
│   ├── api/                           # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── upload/            # Upload & presigned URLs
│   │   │   │   ├── jobs/              # Job CRUD
│   │   │   │   ├── events/            # SSE for progress
│   │   │   │   ├── worker/            # Worker endpoints
│   │   │   │   ├── download/          # Download endpoints
│   │   │   │   ├── health/            # Health check
│   │   │   │   └── stream/            # Video streaming
│   │   │   ├── common/
│   │   │   │   ├── config/            # App configuration
│   │   │   │   ├── database/          # DB setup
│   │   │   │   ├── filters/           # Global exception filter
│   │   │   │   ├── interceptors/      # Logging
│   │   │   │   ├── pipes/             # Validators
│   │   │   │   ├── jobs/              # Auto job cleanup
│   │   │   │   └── logger/            # Pino setup
│   │   │   ├── shared/                # Shared types (job-schema.ts)
│   │   │   ├── storage/               # S3/MinIO/Local abstraction
│   │   │   ├── app.module.ts          # Root module
│   │   │   └── main.ts                # Entry point
│   │   ├── test/                      # E2E tests
│   │   ├── .env                       # Environment config
│   │   └── package.json
│   │
│   ├── web/                           # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/                   # App router
│   │   │   │   ├── page.tsx           # Home page
│   │   │   │   └── layout.tsx         # Root layout
│   │   │   ├── components/            # React components
│   │   │   │   ├── UploadZone.tsx
│   │   │   │   ├── ProgressTracker.tsx
│   │   │   │   ├── LanguageSelector.tsx
│   │   │   │   └── VideoPlayer.tsx
│   │   │   ├── hooks/                 # Custom hooks
│   │   │   │   └── useJobProgress.ts
│   │   │   └── lib/
│   │   │       └── api.ts             # API client
│   │   ├── .env.local                 # Frontend config
│   │   └── package.json
│   │
│   └── worker/                        # (Deprecated) Old Python worker
│       ├── pipeline/
│       ├── tts/
│       └── utils/
│
├── infra/
│   └── postgres/
│       ├── init.sql                   # Database schema
│       └── migrations/
│           └── 002_add_worker_fields.sql
│
├── main_video_translation_pipeline.ipynb  # ⭐ NEW AI Pipeline (Google Colab)
├── docker-compose.yml                 # Services (PostgreSQL, Redis)
├── cors.json                          # CORS config
└── README.md                          # This file
```

---

## 🚀 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production` in NestJS `.env`
- [ ] Use real PostgreSQL database (not Docker)
- [ ] Use real Redis instance (with AUTH)
- [ ] Use AWS S3 or MinIO with proper credentials
- [ ] Enable HTTPS (ngrok or proper reverse proxy)
- [ ] Rotate `SARVAM_API_KEY` and `WORKER_SECRET`
- [ ] Configure backups for PostgreSQL
- [ ] Set up monitoring/alerts for job failures
- [ ] Rate limit API endpoints
- [ ] Add user authentication (JWT)

### Docker Production Build

```bash
# Build API image
cd apps/api
docker build -t video-translation-api:latest .

# Build Web image
cd apps/web
docker build -t video-translation-web:latest .

# Push to registry
docker tag video-translation-api:latest myregistry/video-translation-api:latest
docker push myregistry/video-translation-api:latest
```

---

## 📖 References

- **Faster-Whisper:** https://github.com/SYSTRAN/faster-whisper
- **OmniVoice:** https://github.com/k2-fsa/OmniVoice
- **Sarvam AI:** https://console.sarvam.ai
- **NestJS:** https://docs.nestjs.com
- **Next.js:** https://nextjs.org/docs
- **BullMQ:** https://docs.bullmq.io

---

## 📄 License

This project is provided as-is. Use at your own risk.

---

## 💬 Support

For issues or questions:
1. Check **Troubleshooting** section above
2. Review `.env.example` for configuration
3. Check Docker logs: `docker-compose logs -f`
4. Check API logs: `npm run start:dev` (watch mode shows live output)

---

**Built with ❤️ for seamless video translation.**
