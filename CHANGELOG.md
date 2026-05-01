# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- (Upcoming features here)

### Changed
- (Upcoming changes here)

### Deprecated
- (Deprecations here)

### Removed
- (Removals here)

### Fixed
- (Bug fixes here)

### Security
- (Security fixes here)

---

## [1.0.0] - 2024-12-01

### Added

#### Features
- ✨ **Video Upload & Processing** – Web UI for uploading videos and selecting source/target languages
- ✨ **Real-time Progress Tracking** – SSE-based live updates showing pipeline progress (transcription, translation, TTS)
- ✨ **Subtitle Generation** – Automatic WebVTT subtitle generation in source and target languages
- ✨ **Soft Subtitles** – Embedded MP4 subtitle tracks (user can toggle on/off)
- ✨ **Voice Cloning** – OmniVoice TTS preserves original speaker characteristics
- ✨ **Multi-language Support** – 100+ language pairs via Sarvam AI (modern-colloquial and formal modes)
- ✨ **Presigned Downloads** – Direct S3 URL download without server streaming overhead
- ✨ **Worker Architecture** – Isolated GPU workers (Google Colab, AWS EC2, Modal Labs) via polling architecture

#### Backend (NestJS)
- ✨ **Job Management API** – RESTful endpoints for job creation, status, download
- ✨ **Storage Abstraction** – Support for AWS S3, MinIO, and local filesystem
- ✨ **Real-time Events** – Redis Pub/Sub → SSE for instant progress updates
- ✨ **Database Schema** – PostgreSQL with job state machine (QUEUED → PROCESSING → COMPLETED/FAILED)
- ✨ **Worker Authentication** – X-Worker-Secret header-based auth for worker endpoints
- ✨ **Health Checks** – `/api/health` endpoint for monitoring
- ✨ **Error Handling** – Global exception filter, structured logging (Pino)
- ✨ **Job Cleanup** – Automatic deletion of old completed/failed jobs

#### Frontend (Next.js)
- ✨ **Video Upload UI** – Drag-and-drop upload with file size validation
- ✨ **Language Selector** – Dropdown for source and target languages
- ✨ **Progress Tracker** – Stage-by-stage progress bar with live stage names
- ✨ **Download Component** – Display translated video and subtitle links after completion
- ✨ **Responsive Design** – Mobile-friendly UI with Tailwind CSS

#### Pipeline (Python)
- ✨ **Stage 1: Audio Extraction** – FFmpeg-based audio extraction (24 kHz mono WAV)
- ✨ **Stage 2: Transcription + VAD** – faster-whisper with Silero VAD for phrase-level segmentation
- ✨ **Stage 2.5: Reference Chunk** – Automatic selection of optimal 3-10s window for voice cloning
- ✨ **Stage 3: Translation** – Sarvam AI with delimiter-based batching for 100+ language pairs
- ✨ **Stage 4: TTS** – OmniVoice voice cloning with duration pinning
- ✨ **Stage 5: Audio Assembly** – Master track assembly with room tone for natural silence
- ✨ **Stage 6: Subtitle Generation** – WebVTT creation for both languages
- ✨ **Stage 7: Video Merge** – FFmpeg merge with soft subtitle embedding
- ✨ **Worker Loop** – Continuous polling for jobs, progress reporting, error handling

#### Infrastructure
- ✨ **Docker Compose** – PostgreSQL + Redis quick setup
- ✨ **Database Schema** – Job state tracking with indexes for fast queries
- ✨ **Configuration** – Environment variable-based config for all components

### Changed
- 🔄 **Replaced old Python worker** – Previous apps/worker directory is deprecated; use main_video_translation_pipeline.ipynb instead
- 🔄 **Architecture overhaul** – Three-tier (API, Frontend, Worker) with async job queue instead of monolithic service

### Deprecated
- ⚠️ `apps/worker/` – Old synchronous worker; replaced by async worker loop in notebook

### Fixed
- 🐛 **SSE Memory Leak** – Use RxJS `finalize()` operator for proper Observable cleanup

---

## [0.1.0] - (Legacy)

### Added
- Initial monolithic Python worker implementation (deprecated)
- Basic video transcription and translation

---

## How to Report Issues

Found a bug? Please [open an issue](https://github.com/yourusername/Video-Translation-with-NestJS/issues/new) with:
- Clear description
- Steps to reproduce
- Expected vs. actual behavior
- Environment details (OS, Node version, Python version, etc.)

## How to Contribute

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## Migration Guide

### From Old Worker (apps/worker/) to New Pipeline

**Old approach:**
- Monolithic Python service
- Direct file I/O
- No real-time progress

**New approach:**
1. Hosted worker (Google Colab, AWS EC2, etc.)
2. Polls API for jobs
3. S3 presigned URLs (no server-side I/O)
4. Real-time progress via Redis pubsub → SSE

**Migration:**
- Delete old `apps/worker/` code
- Use `main_video_translation_pipeline.ipynb`
- Configure API URL & secrets in Colab
- Run worker polling loop

---

**Latest Version:** [1.0.0](https://github.com/yourusername/Video-Translation-with-NestJS/releases/tag/v1.0.0)
