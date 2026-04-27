// ─────────────────────────────────────────────────────────────
// Queue & Job constants — shared between producer (API) and
// consumer (Python worker via bullmq-python or redis directly)
// ─────────────────────────────────────────────────────────────

export const TRANSLATION_QUEUE = "translation";

export const JobStatus = {
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
    progress: number; // 0-100
    stage: PipelineStage;
    message?: string;
}

export enum PipelineStage {
    AUDIO_EXTRACTION = "AUDIO_EXTRACTION",
    TRANSCRIPTION = "TRANSCRIPTION",
    TRANSLATION = "TRANSLATION",
    SYNTHESIS = "SYNTHESIS",
    VIDEO_MERGE = "VIDEO_MERGE",
    DONE = "DONE",
}
