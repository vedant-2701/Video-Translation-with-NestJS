# Architecture & Technical Design

This document provides a deep technical dive into the Video Translation system architecture, data flows, and design decisions.

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Data Flow](#data-flow)
3. [Modules & Services](#modules--services)
4. [Storage Architecture](#storage-architecture)
5. [Job State Machine](#job-state-machine)
6. [Real-time Events (SSE)](#real-time-events-sse)
7. [Worker Communication](#worker-communication)
8. [Pipeline Stages Deep Dive](#pipeline-stages-deep-dive)
9. [Error Handling & Resilience](#error-handling--resilience)
10. [Performance Optimization](#performance-optimization)

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND TIER                              │
│          (Next.js SPA running in browser)                     │
│                                                                │
│  UploadZone → upload video                                    │
│  LanguageSelector → choose target language                    │
│  ProgressTracker → subscribe SSE → real-time updates         │
│  VideoPlayer → download & play result                         │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        │ HTTPS
                        ├─ POST /api/upload/init (get presigned PUT URL)
                        ├─ POST /upload/confirm (queue job)
                        ├─ GET /jobs/{id} (poll status)
                        ├─ GET /events/{id} (SSE subscribe)
                        └─ GET /download/{id} (get presigned GET URL)
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                    API TIER (NestJS)                          │
│                    (Port 3000)                                │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┤
│  │ MODULES                                                   │
│  │ ├─ upload/          presigned URLs, job creation         │
│  │ ├─ jobs/           job CRUD, status queries              │
│  │ ├─ events/         SSE subscription, Redis pubsub        │
│  │ ├─ download/       download URLs                         │
│  │ ├─ worker/         worker registration, auth             │
│  │ ├─ health/         health check endpoint                 │
│  │ └─ stream/         video streaming                        │
│  │                                                            │
│  │ DATABASE                                                  │
│  │ └─ PostgreSQL: translation_jobs table                    │
│  │                                                            │
│  │ CACHE & QUEUE                                             │
│  │ └─ Redis: pubsub (SSE), job queue (BullMQ)               │
│  │                                                            │
│  │ STORAGE (abstracted)                                      │
│  │ └─ S3, MinIO, or Local filesystem                        │
│  └──────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼────────────────┐
        │               │                │
        │               │                │
    [Worker API]    [Job Queue]   [Event Pubsub]
        │               │                │
        │               │                │
   /api/worker/*    BullMQ Queue    Redis Pub/Sub
   (Protected by              │            │
    X-Worker-Secret)          │            │
                              │            │
┌─────────────────────────────▼──────────────▼──────────────────┐
│                   WORKER TIER (Python)                         │
│              (Runs on GPU, e.g., Colab T4)                    │
│                                                                │
│  1. Poll /api/worker/next-queued every 10s                   │
│  2. Download input video from S3 presigned URL               │
│  3. Run 7-stage pipeline (∼5–20 min)                         │
│  4. POST progress updates to /api/worker/{jobId}/progress    │
│  5. Upload output MP4 + VTT to S3 presigned URLs             │
│  6. POST /api/worker/{jobId}/complete                        │
│  7. Loop to step 1                                            │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┤
│  │ PIPELINE (7 stages)                                       │
│  │ 1. Extract Audio (FFmpeg)                                │
│  │ 2. Transcribe (faster-whisper + VAD)                     │
│  │ 3. Translate (Sarvam AI)                                 │
│  │ 4. Synthesize (OmniVoice)                                │
│  │ 5. Assemble Audio (overlay, room tone)                   │
│  │ 6. Generate Subtitles (WebVTT)                           │
│  │ 7. Merge Video (embed audio + subtitles)                 │
│  └──────────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                 STORAGE TIER (S3 / MinIO)                     │
│                                                                │
│  /uploads/               input videos (pre-signed)            │
│  /outputs/               translated videos + subtitles        │
│                                                                │
│  Lifecycle: input → output → deleted after N days            │
└────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Video Upload → Processing → Download

#### 1. Upload Initiation
```
User selects video file
        ↓
Frontend: POST /api/upload/init
  {
    filename: "myvideo.mp4",
    fileSizeMb: 120,
    sourceLanguage: "en-IN",
    targetLanguage: "hi-IN"
  }
        ↓
API: UploadService.initUpload()
  ├─ Validate file size
  ├─ Create PENDING job in PostgreSQL
  ├─ Request presigned PUT URL from S3/MinIO
  └─ Return presigned URL to browser
        ↓
Response: {
  jobId: "550e8400-e29b-41d4-a716-446655440000",
  uploadUrl: "https://s3.amazonaws.com/...?Signature=..."
}
```

#### 2. Direct Browser Upload to S3
```
Frontend: PUT request (presigned URL)
  ├─ Browser uploads directly to S3
  ├─ S3 validates signature
  └─ Returns 200 OK
        ↓
(Optional) Browser shows "Upload complete"
```

#### 3. Confirm Upload & Queue Job
```
Frontend: POST /api/upload/confirm
  { jobId: "550e8400-e29b-41d4-a716-446655440000" }
        ↓
API: UploadService.confirmUpload()
  ├─ Mark job status = QUEUED
  ├─ Add to Redis BullMQ queue
  └─ Publish event: "job_queued"
        ↓
Response: { jobId, status: "QUEUED" }
```

#### 4. Real-time Progress Tracking
```
Frontend: GET /api/events/{jobId} (SSE)
        ↓
API: EventsService.subscribe()
  ├─ Create Redis subscriber for channel "{jobId}"
  ├─ Replay latest progress from DB (if already started)
  ├─ Stream messages as Observable
  └─ Use finalize() to cleanup on disconnect
        ↓
Browser: EventSource receives messages
  {
    progress: 45,
    stage: "stage_3_translate",
    message: "Translating segments..."
  }
        ↓
ProgressTracker component updates UI in real-time
```

#### 5. Worker Polls & Processes
```
Worker: GET /api/worker/next-queued (10s interval)
        ↓
API: WorkerController.getNextQueued()
  ├─ Check BullMQ for QUEUED jobs
  ├─ Pick oldest job
  └─ Return job metadata
        ↓
Worker: Receives job
  ├─ GET presigned download URL for input video
  ├─ Stream download from S3 (large files)
  └─ Save to /content/job_{id}_input.mp4
```

#### 6. Pipeline Execution with Progress
```
Worker: Run 7-stage pipeline
        ├─ Stage 1 starts
        ├─ POST /api/worker/{jobId}/progress
        │  { progress: 10, stage: "stage_1_extract_audio", ... }
        ├─ → API → Redis pubsub → SSE subscribers
        │  (Frontend gets instant update)
        ├─ Stage 1 completes
        ├─ Stage 2 starts
        └─ ... repeat for stages 2–7 ...
```

#### 7. Upload Output & Mark Complete
```
Worker: Generate output MP4 + VTT files
        ├─ GET presigned PUT URL for output
        ├─ PUT output.mp4 to S3
        ├─ PUT subtitles_{en,hi}.vtt to S3
        └─ POST /api/worker/{jobId}/complete
           {
             s3OutputKey: "outputs/{jobId}-output.mp4",
             s3SubtitleEnKey: "outputs/{jobId}-subtitles-en.vtt",
             s3SubtitleHiKey: "outputs/{jobId}-subtitles-hi.vtt"
           }
        ↓
API: WorkerController.complete()
  ├─ Update job status = COMPLETED
  ├─ Save S3 output paths
  ├─ Publish event: "job_completed"
  └─ SSE subscribers see 100% progress
```

#### 8. Download Result
```
Frontend: User clicks "Download"
        ├─ GET /api/download/{jobId}
        ├─ API generates presigned GET URL (24hr expiry)
        └─ Returns { downloadUrl, filename }
        ↓
Browser: Redirects to presigned URL
        ├─ S3 validates signature
        ├─ Streams file to browser
        └─ Browser shows "Save As" dialog
```

---

## Modules & Services

### Upload Module

**Key Components:**
- `UploadService`: Orchestrates upload flow
- `upload.controller.ts`: HTTP endpoints
- `dto/`: Data validation (InitUploadDto, ConfirmUploadDto)

**Storage Abstraction:**
```typescript
interface IStorageProvider {
  getPresignedPutUrl(key: string, expiresIn: number): Promise<string>;
  getPresignedGetUrl(key: string, expiresIn: number): Promise<string>;
  // ... other methods
}
```

**Implementations:**
- `S3StorageProvider`: AWS S3 (via @aws-sdk/client-s3)
- `MinIOStorageProvider`: MinIO-compatible S3 (minio package)
- `LocalStorageProvider`: Filesystem (for local dev)

### Jobs Module

**Purpose:** Job state management

**Database Schema:**
```sql
TABLE translation_jobs {
  id UUID PRIMARY KEY,
  status ENUM (QUEUED, PROCESSING, COMPLETED, FAILED),
  progress INT (0-100),
  sourceLanguage VARCHAR,
  targetLanguage VARCHAR,
  inputFilename TEXT,
  inputPath TEXT,
  outputPath TEXT,
  errorMessage TEXT,
  createdAt TIMESTAMPTZ,
  updatedAt TIMESTAMPTZ
}
```

**Services:**
- `JobRepository`: Direct DB access (created/read/updated jobs)
- `JobsService`: Business logic (getJob, updateProgress, etc.)
- `JobsController`: HTTP endpoints

### Events Module

**Purpose:** Real-time progress via Server-Sent Events (SSE)

**Key Implementation Details:**

1. **Persistent Publisher:**
   - One Redis connection (not per-publish)
   - Reused across all event publishes
   - Prevents connection leaks under high load

2. **Active Subscribers Map:**
   ```typescript
   Map<jobId, {
     subscriber: Redis,
     subject: Subject<MessageEvent>,
     refCount: number
   }>
   ```

3. **Replay on Connect:**
   - New SSE clients immediately receive current progress
   - Prevents race conditions where stages complete before subscription
   - Query: `SELECT progress, stage FROM translation_jobs WHERE id = ?`

4. **finalize() Operator:**
   - Ensures cleanup on any termination (unsubscribe, complete, error)
   - Unsubscribes from Redis channel
   - Handles React StrictMode double-invocations
   - Prevents orphaned subscribers

**Flow:**
```typescript
// When progress updates
this.jobRepository.updateProgress(jobId, { progress: 45, stage: "..." });
this.publisher.publish(`job:${jobId}:progress`, JSON.stringify(data));

// When SSE client connects
subscribe(jobId): Observable<MessageEvent> {
  const { current } = await this.jobRepository.findById(jobId);
  return subject.asObservable().pipe(
    startWith(current),  // Replay current state
    finalize(() => {
      // Cleanup (unsubscribe from Redis, close subscriber)
    })
  );
}
```

### Worker Module

**Purpose:** Authenticate worker, manage job polling/completion

**Endpoints:**
- `GET /api/worker/next-queued` – Poll for job
- `GET /api/worker/{jobId}/input-url` – Get download URL
- `POST /api/worker/{jobId}/output-upload-url` – Get PUT URL
- `POST /api/worker/{jobId}/progress` – Report progress
- `POST /api/worker/{jobId}/complete` – Mark complete
- `POST /api/worker/{jobId}/fail` – Mark failed

**Auth:** `X-Worker-Secret` header (required on all endpoints)

**Guard:**
```typescript
@Injectable()
export class WorkerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const secret = request.headers['x-worker-secret'];
    return secret === process.env.WORKER_SECRET;
  }
}
```

---

## Storage Architecture

### Multi-Provider Support

**Problem:** Different deployment scenarios need different storage:
- Local dev: filesystem
- Single-region cloud: AWS S3
- Self-hosted: MinIO

**Solution:** Abstract `IStorageProvider` interface with multiple implementations

### S3 Provider

```typescript
class S3StorageProvider implements IStorageProvider {
  private s3: S3Client;

  async getPresignedPutUrl(key: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return await getSignedUrl(this.s3, command, { expiresIn: 3600 });
  }

  async upload(key: string, stream: ReadableStream): Promise<void> {
    return this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: stream,
    }));
  }
}
```

### Presigned URL Lifecycle

```
API generates presigned URL (valid for 1 hour)
        │
        ├─ Browser/Worker receives URL
        │
        ├─ Uploads within 1 hour → ✅ Success
        │
        └─ Uploads after 1 hour → ❌ 403 Forbidden
           (Signature expired)
```

### Multipart Upload (for Large Files)

```typescript
// Browser uploads 500 MB file in 5 MB chunks
const partSize = 5 * 1024 * 1024;
for (let i = 0; i < numParts; i++) {
  const chunk = file.slice(i * partSize, (i + 1) * partSize);
  await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes ${start}-${end}/*` },
    body: chunk,
  });
}
```

---

## Job State Machine

```
  ┌─────────┐
  │ PENDING │  (just created, presigned URL given)
  └────┬────┘
       │ upload confirmed
       ▼
  ┌─────────┐
  │ QUEUED  │  (waiting in BullMQ queue)
  └────┬────┘
       │ worker polls
       ▼
  ┌──────────────┐
  │ PROCESSING   │  (worker running pipeline)
  └┬────────────┬┘
   │            └──────────────┐
   │                           │
   │ all stages pass           │ error or timeout
   ▼                           ▼
  ┌──────────┐            ┌────────┐
  │ COMPLETED│            │ FAILED │
  └──────────┘            └────────┘
```

**Transitions:**
- PENDING → QUEUED: `uploadService.confirmUpload()`
- QUEUED → PROCESSING: `workerController.nextQueued()`
- PROCESSING → COMPLETED: `workerController.complete()`
- PROCESSING → FAILED: `workerController.fail()` or timeout

**Timeout:** 30-minute inactivity → auto-transition to FAILED

---

## Real-time Events (SSE)

### How SSE Works

```
1. Browser initiates persistent HTTP connection
   GET /api/events/{jobId}

2. Server responds with Content-Type: text/event-stream
   (Connection stays open indefinitely)

3. Server can push messages anytime:
   data: {"progress": 45, "stage": "stage_3"}

4. Browser's EventSource parses each message
   eventSource.onmessage = (e) => {
     const data = JSON.parse(e.data);
     updateUI(data);
   }

5. Connection closes when:
   - Job completes
   - 5 min inactivity timeout
   - User navigates away
   - Network drops
```

### Architecture

```
Frontend SSE                Redis Subscribers              API DB
         │                        │                          │
         ├─ GET /events/{id}      │                          │
         │                        │                          │
         ├────────────────────────┼─ subscribe({jobId})      │
         │                        │                          │
         │                        │                          │
(Worker reports progress)         │                          │
         │                        │                          │
         │  POST /progress        │                          │
         ├────────────────────────┼─ publish({jobId})─── updateDB()
         │                        │                          │
         │                        ├─ message: {...}          │
         │◄───────────────────────┤                          │
         │  data: {...}           │                          │
         │                        │                          │
 (UI updates)                     │                          │
```

### Replay on Connection

**Problem:** If worker finishes Stage 1 before browser subscribes to SSE, browser misses the update.

**Solution:** Replay current state on subscription:

```typescript
subscribe(jobId): Observable<MessageEvent> {
  const current = await db.get(jobId);  // Current progress
  return subject.asObservable().pipe(
    startWith({                          // Emit current immediately
      progress: current.progress,
      stage: current.stage,
    }),
    finalize(() => cleanup())
  );
}
```

---

## Worker Communication

### Authentication

All worker requests require header:
```
X-Worker-Secret: <value from WORKER_SECRET env var>
```

**Why not JWT?**
- Worker is trusted environment (Colab with our code)
- Simple shared secret is sufficient
- No user identity needed

### Job Polling

Worker polls every 10 seconds:

```
GET /api/worker/next-queued
(X-Worker-Secret header)
        │
        ├─ Database has QUEUED jobs → Return oldest
        │  {
        │    jobId: "...",
        │    sourceLanguage: "en-IN",
        │    targetLanguage: "hi-IN",
        │    inputFilename: "video.mp4"
        │  }
        │
        └─ No QUEUED jobs → 204 No Content (no body)
```

**Why polling instead of webhooks?**
- Worker might not have stable endpoint (Colab)
- Polling is simple and reliable
- 10s interval is fast enough for most use cases

### Progress Reporting

Worker periodically POSTs progress:

```
POST /api/worker/{jobId}/progress
X-Worker-Secret: ...
Content-Type: application/json

{
  "progress": 65,
  "stage": "stage_4_tts",
  "message": "Synthesizing segment 18/28"
}
```

**Server-side:**
```typescript
@Post(':jobId/progress')
async updateProgress(
  @Param('jobId') jobId: string,
  @Body() dto: UpdateProgressDto,
) {
  // 1. Update DB
  await jobRepository.updateProgress(jobId, {
    progress: dto.progress,
    status: 'PROCESSING',
  });

  // 2. Publish to Redis
  await publisher.publish(`job:${jobId}:progress`, JSON.stringify(dto));

  // 3. SSE subscribers get message immediately
}
```

### Completion & Failure

```
Success:
  POST /api/worker/{jobId}/complete
  {
    s3OutputKey: "outputs/...-output.mp4",
    s3SubtitleEnKey: "outputs/...-subtitles-en.vtt",
    s3SubtitleHiKey: "outputs/...-subtitles-hi.vtt"
  }
  → Job status = COMPLETED

Failure:
  POST /api/worker/{jobId}/fail
  {
    errorMessage: "CUDA out of memory"
  }
  → Job status = FAILED
  → Error message saved to DB
```

---

## Pipeline Stages Deep Dive

### Stage 1: Extract Audio

**Tool:** FFmpeg

**Input:** Video file (any format)

**Output:** 24 kHz mono PCM WAV

**Command:**
```bash
ffmpeg -i input.mp4 \
  -vn \
  -acodec pcm_s16le \
  -ar 24000 \
  -ac 1 \
  output.wav
```

**Why 24 kHz?**
- OmniVoice outputs at 24 kHz (must match reference)
- Enough fidelity for speech (human voice ~4 kHz)
- Lower than CD quality (44.1 kHz) = smaller file = faster processing

### Stage 2: Transcribe with VAD

**Tool:** faster-whisper (Whisper with CTransformer backend)

**Input:** 24 kHz WAV

**Output:** List of Segment objects with timestamps

**Process:**
1. Load Whisper model (medium.en = 769 MB)
2. Enable Silero VAD (detects speech boundaries)
3. Transcribe with VAD min_silence_ms = 400

**VAD Details:**
```
Audio timeline: [speech] 500ms_silence [speech] 300ms_silence [speech]
                                ↑ gap > 400ms
                                └─ segment boundary here

Result:
  Segment 0: [0.0s – 2.5s] "Hello, how are you"
  Segment 1: [3.2s – 5.1s] "I'm doing well"
  Segment 2: [5.4s – 7.8s] "Great!"
```

**Reference Chunk Selection:**
```
Goal: Find 3–10s window that maximizes speech coverage
      (for voice cloning reference)

Algorithm:
  1. Slide 10s window across audio
  2. Score each position by total speech seconds inside
  3. Pick highest-scoring window
  4. Extract that slice as WAV file
  5. Transcribe text for that window (used by OmniVoice)
```

**Fail-Fast Guards:**
```
if not segments:
  raise SilentAudioError("No speech detected")

if total_chars < 10:
  raise TranscriptTooShortError("Transcript too short to translate")

if not valid_ref_chunk:
  raise NoValidReferenceChunkError("Can't find 3-10s reference")
```

### Stage 3: Translate Segments

**Tool:** Sarvam AI API (mayura or sarvam-translate model)

**Input:** List of segment texts

**Output:** Translated texts (same order)

**Batching Strategy:**
```
Problem: Each segment is atomic (can't split across API calls)
         API has char limit (1000 or 2000)

Solution:
  1. Pack segments with delimiters:
     |||SEG_1||| Hello, how are you
     |||SEG_2||| I'm doing well
     |||SEG_3||| Great!

  2. If combined char count > limit:
     - Batch segments up to limit
     - Call API separately for each batch

  3. Parse response:
     - Split by delimiter regex: /\|\|\|\s*SEG_\d+\s*\|\|\|/
     - Verify segment count matches sent count
```

**Model Selection:**
```
if translation_mode == 'formal':
  use sarvam-translate:v1  (2000 char limit, higher quality)
else:
  use mayura:v1            (1000 char limit, faster)
```

**Error Handling:**
```
if response segment count ≠ sent count:
  raise RuntimeError("Translation parsing failed")
  (Abort entire job, don't retry)
```

### Stage 4: Synthesize Audio (OmniVoice)

**Tool:** OmniVoice (PyTorch-based voice cloning)

**Input:** 
- Translated text (per segment)
- Reference audio WAV (3–10s, 24 kHz)
- Reference text (transcript of ref chunk)
- Duration (segment.end – segment.start)

**Output:** Audio tensor (1, T) at 24 kHz

**Key Parameters:**
```python
model.generate(
  text=translated_text,
  ref_audio=ref_chunk_path,
  duration=segment.duration,        # Duration pinning
  num_step=64,                       # Quality: 16=fast, 64=high
  postprocess_output=True,           # Remove trailing silence
)
```

**Duration Pinning:**
```
Why: Generated audio might not fit time slot naturally
     (e.g., generated 3.5s audio for 3s slot = overlaps next segment)

Solution: Pass slot duration to model
          OmniVoice stretches/shrinks to fit

Edge case: Generated duration > 1.25× slot
          Likely data corruption → truncate (don't stretch)
```

**Sanity Check:**
```
actual_duration = audio.shape[-1] / 24000
ratio = actual_duration / slot_duration

if ratio > 1.25:
  truncate audio to slot duration
  log warning (something likely went wrong)
```

**Memory Management:**
```
Before Stage 4:
  - Whisper model still in VRAM (768 MB)
  - OmniVoice needs 3–5 GB (float16 on T4)
  - Total > 6 GB available → CUDA OOM

Solution:
  after whisper_stage.run():
    whisper_stage.unload()  # del model, torch.cuda.empty_cache()
```

### Stage 5: Assemble Audio

**Tool:** NumPy, torchaudio

**Input:** List of synthesized audio tensors + timestamps

**Output:** Single master audio track (24 kHz WAV)

**Process:**
```
1. Create silent master track
   duration = video_duration
   sample_rate = 24000
   master = zeros(duration * sample_rate)

2. For each segment with audio:
   start_sample = segment.start * 24000
   end_sample = segment.end * 24000
   
   # Overlay synthesized audio
   master[start_sample:end_sample] = segment.audio

3. Fill gaps (silence between segments):
   - Generate white noise at -40 dBFS
   - Overlay on non-speech gaps
   - Avoids jarring digital silence

4. Export as 16-bit PCM WAV
```

**Room Tone (Background Hiss):**
```
-40 dBFS = barely perceptible hiss
          helps bridge silence gaps naturally
          like video room ambience
```

### Stage 6: Generate Subtitles

**Input:** Segments with text + timestamps

**Output:** WebVTT files (English + target language)

**Format:**
```vtt
WEBVTT

00:00:00.000 --> 00:00:03.500
Hello, how are you today?

00:00:03.200 --> 00:00:05.100
I'm doing well, thank you
```

**Timestamp Conversion:**
```
segment.start = 2.5 (seconds)
timestamp = HH:MM:SS.mmm
          = 00:00:02.500
```

### Stage 7: Merge Video

**Tool:** FFmpeg

**Input:**
- Original MP4 video
- Master audio WAV (24 kHz)
- Subtitle SRT files (2x: EN, HI)

**Output:** Final MP4 with:
- Original video (no re-encode)
- New audio track
- Two soft subtitle tracks (mov_text codec)

**Command:**
```bash
ffmpeg -i original.mp4 \
  -i master_audio.wav \
  -i subtitles_en.srt \
  -i subtitles_hi.srt \
  -c:v copy                # No video re-encode (instant)
  -c:a aac                 # Audio codec
  -c:s mov_text            # Subtitle codec for MP4
  -map 0:v:0               # Map video from input 0
  -map 1:a:0               # Map audio from input 1
  -map 2:0                 # Map EN subtitles
  -map 3:0                 # Map HI subtitles
  -metadata:s:s:0 language=eng  # Set EN track language
  -metadata:s:s:0 title=English
  -metadata:s:s:1 language=hin  # Set HI track language
  -metadata:s:s:1 title=Hindi
  -disposition:s:0 default # EN shown by default
  -disposition:s:1 0       # HI off by default
  output.mp4
```

**Why `-c:v copy`?**
```
Re-encoding video = 30+ minutes of processing
Copying video stream = < 1 minute
User doesn't care about video codec, only audio + subtitles
```

**VTT → SRT Conversion:**
```
VTT (for web):  00:00:02.500 --> 00:00:05.100
SRT (for MP4):  00:00:02,500 --> 00:00:05,100
                          ^                    ^
                    period → comma
```

---

## Error Handling & Resilience

### Fail-Fast Principle

Some errors indicate unrecoverable failures. Fail immediately rather than retry:

```
SilentAudioError
  → No speech detected
  → No translation possible
  → Abort immediately

TranscriptTooShortError
  → Transcript < 10 chars
  → Can't translate meaningfully
  → Abort immediately

NoValidReferenceChunkError
  → Can't find 3-10s speech chunk
  → Voice cloning needs reference
  → Abort immediately

TranslationSegmentMismatch
  → Expected 28 segments, got 15
  → Delimiter parsing failed
  → Data integrity compromised
  → Abort immediately
```

### Partial Failures

Some failures allow graceful degradation:

```
OmniVoice TTS fails for segment 5:
  ├─ Log error
  ├─ Mark segment.audio = None
  └─ Continue with other segments

Assembly stage:
  ├─ Skip segments with audio=None
  ├─ Leave silence in those slots
  └─ Still produce valid output
```

### Timeout & Retry

```
If worker processing takes > 30 min:
  ├─ No progress update received
  ├─ Auto-mark job as FAILED
  └─ Worker can retry (will poll again)

If worker crashes during processing:
  ├─ No `/complete` call sent
  ├─ 30 min timeout → job FAILED
  ├─ File cleanup (temp files deleted)
  └─ Job can be retried
```

### Database Consistency

```
Job status transitions are atomic:
  ├─ PostgreSQL transaction ensures consistency
  ├─ Even if error during update, DB is valid
  └─ No orphaned jobs or partial state

Example:
  BEGIN TRANSACTION
    UPDATE translation_jobs SET status='COMPLETED', progress=100
    WHERE id = $1
  COMMIT
  (Atomic: all-or-nothing)
```

---

## Performance Optimization

### Database Indexes

```sql
-- Fast status polling (worker queries for QUEUED jobs)
CREATE INDEX idx_translation_jobs_status ON translation_jobs(status);

-- Fast creation time sorting (list jobs by date)
CREATE INDEX idx_translation_jobs_created_at ON translation_jobs(created_at DESC);
```

### Redis Pub/Sub

```
Instead of:
  polling database every 1s (100 DB hits/min)

Use Redis Pub/Sub:
  worker POSTs progress → Redis publishes event
  all subscribed clients get instant notification (< 10ms)
  zero polling overhead
```

### Presigned URLs

```
Instead of:
  worker uploads → API → database → file storage
  (API is bottleneck for large files)

Use presigned URLs:
  worker uploads directly to S3
  API only handles metadata (job tracking)
  S3 handles all bandwidth
  scales to unlimited concurrent uploads
```

### Audio Processing

```
Pipeline bottlenecks:
  Stage 1: FFmpeg (I/O) – 10–30s
  Stage 2: Whisper (GPU) – 30–120s
  Stage 3: API calls (network) – 30–60s
  Stage 4: OmniVoice (GPU) – 120–600s (longest!)
  Stage 5: Assembly (CPU) – 10–30s
  Stage 6: Subtitles (CPU) – < 1s
  Stage 7: FFmpeg (I/O) – 10–30s
  
Total: 5–20 minutes (dominated by Stage 4 TTS)

Optimization:
  Stage 4 quality trade-off:
    num_step = 64 → high quality, slow (64 iterations)
    num_step = 32 → lower quality, 2× faster
    num_step = 16 → draft quality, 4× faster
```

### Concurrent Workers

```
System is horizontally scalable:
  1 worker → 1 job every 15 minutes
  5 workers → 5 jobs in parallel → 1 job every 3 minutes
  20 workers → 20 jobs in parallel → 1 job every 45 seconds

No bottleneck at API layer:
  ├─ Database → stateless (no session state)
  ├─ Redis → simple pubsub (no persistence needed)
  ├─ Storage → delegated to S3/MinIO
  └─ Add workers as needed
```

---

## Monitoring & Observability

### Key Metrics

```
Business metrics:
  ├─ Jobs/day (throughput)
  ├─ Avg job duration (performance)
  ├─ Success rate (reliability)
  ├─ Avg video size (capacity planning)
  └─ Source/target language distribution (usage patterns)

Technical metrics:
  ├─ API response times (latency)
  ├─ Database query times (slow logs)
  ├─ Redis memory usage (cache health)
  ├─ Worker status (connected / disconnected)
  ├─ Job queue depth (backlog)
  └─ Error rate by type (debugging)
```

### Logging Strategy

```typescript
// Structured logging with Pino
logger.info({
  msg: 'Job started',
  jobId: job.id,
  sourceLanguage: job.sourceLanguage,
  duration: job.videoDuration,
  fileSize: job.inputFileSizeMb,
});

// Log levels:
// debug   – detailed debugging info
// info    – general informational messages
// warn    – warnings (recoverable issues)
// error   – errors (check required)
// fatal   – fatal errors (crash)
```

---

**This completes the architecture documentation. For operational guides, see [DEPLOYMENT.md](./DEPLOYMENT.md).**
