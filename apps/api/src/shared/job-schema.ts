// ─────────────────────────────────────────────────────────────
// Queue & Job constants — shared between producer (API) and
// consumer (Python worker via bullmq-python or redis directly)
// ─────────────────────────────────────────────────────────────

export const TRANSLATION_QUEUE = "translation";

export const JobStatus = {
    PENDING: "PENDING",
    QUEUED: "QUEUED",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
} as const;

export type JobStatusType = (typeof JobStatus)[keyof typeof JobStatus];

// Payload enqueued into BullMQ
export interface TranslationJobPayload {
    jobId: string;
    inputPath: string; // path relative to storage root
    outputPath: string; // pre-determined output path
    sourceLanguage: string;
    targetLanguage: string;
}

// Progress event emitted by worker back via Redis pub/sub
export interface JobProgressEvent {
    jobId: string;
    progress: number; // 0–100
    stage: string; // PipelineStage value
    message?: string;
    isReplay?: boolean; // true when emitted on SSE connect from DB state
}

export enum PipelineStage {
    EXTRACT_AUDIO = "stage_1_extract_audio",
    TRANSCRIBE = "stage_2_transcribe",
    TRANSLATE = "stage_3_translate",
    TTS = "stage_4_tts",
    ASSEMBLE = "stage_5_assemble",
    MERGE = "stage_6_merge",
    DONE = "DONE",
    FAILED = "FAILED",
}
