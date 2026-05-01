"use client";

import type { ProgressEvent } from "@/lib/api";

const STAGE_ORDER = [
    "stage_1_extract_audio",
    "stage_2_speech_to_text",
    "stage_3_translate_text",
    "stage_4_text_to_speech",
    "stage_5_merge_audio_video",
    "DONE",
];

const STAGE_LABELS: Record<string, string> = {
    stage_1_extract_audio: "Extracting Audio",
    stage_2_speech_to_text: "Speech to Text",
    stage_3_translate_text: "Translating",
    stage_4_text_to_speech: "Generating Speech",
    stage_5_merge_audio_video: "Merging Video",
    DONE: "Complete",
    STARTED: "Starting",
    FAILED: "Failed",
    PROCESSING: "Processing",
    QUEUED: "Queued",
};

const STAGE_DONE_AT: Record<string, number> = {
    stage_1_extract_audio: 10,
    stage_2_transcribe: 28,
    stage_3_translate: 45,
    stage_4_tts: 72,
    stage_5_assemble: 83,
    stage_6_subtitles: 88,
    stage_7_merge: 95,
};

interface ProgressTrackerProps {
    events: ProgressEvent[];
    currentProgress: number;
    status: "idle" | "uploading" | "processing" | "completed" | "failed";
    uploadProgress: number;
}

export function ProgressTracker({
    events,
    currentProgress,
    status,
    uploadProgress,
}: ProgressTrackerProps) {
    const latestEvent = events[events.length - 1];
    const currentStage = latestEvent?.stage ?? "";

    return (
        <div className="flex flex-col gap-4 rounded-2xl bg-zinc-900 p-5 ring-1 ring-white/10">
            {/* Overall progress bar */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">
                        {status === "uploading"
                            ? "Uploading..."
                            : status === "processing"
                              ? (STAGE_LABELS[currentStage] ?? "Processing...")
                              : status === "completed"
                                ? "Translation Complete"
                                : status === "failed"
                                  ? "Failed"
                                  : "Ready"}
                    </span>
                    <span className="text-sm tabular-nums text-zinc-400">
                        {status === "uploading"
                            ? `${uploadProgress}%`
                            : `${currentProgress}%`}
                    </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                            status === "failed"
                                ? "bg-red-500"
                                : status === "completed"
                                  ? "bg-emerald-500"
                                  : "bg-indigo-500"
                        }`}
                        style={{
                            width: `${status === "uploading" ? uploadProgress : currentProgress}%`,
                        }}
                    />
                </div>
            </div>

            {/* Stage steps */}
            {(status === "processing" || status === "completed") && (
                <div className="flex flex-col gap-2">
                    {STAGE_ORDER.filter((s) => s !== "DONE").map((stage) => {
                        const stageEvents = events.filter(
                            (e) => e.stage === stage,
                        );
                        const isDone =
                            stageEvents.some((e) =>
                                e.message?.includes("Completed"),
                            ) ||
                            currentProgress >= (STAGE_DONE_AT[stage] ?? 100) ||
                            status === "completed";
                        const isActive = currentStage === stage && !isDone;
                        const hasStarted = stageEvents.length > 0;

                        return (
                            <div
                                key={stage}
                                className="flex items-center gap-3"
                            >
                                {/* Indicator */}
                                <div
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 ${
                                        isDone
                                            ? "bg-emerald-500 text-white"
                                            : isActive
                                              ? "bg-indigo-500 text-white ring-4 ring-indigo-500/30"
                                              : hasStarted
                                                ? "bg-zinc-600 text-zinc-300"
                                                : "bg-zinc-800 text-zinc-600"
                                    }`}
                                >
                                    {isDone ? (
                                        "✓"
                                    ) : isActive ? (
                                        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
                                    ) : null}
                                </div>

                                <span
                                    className={`text-sm transition-colors duration-300 ${
                                        isDone
                                            ? "text-emerald-400"
                                            : isActive
                                              ? "font-medium text-white"
                                              : hasStarted
                                                ? "text-zinc-400"
                                                : "text-zinc-600"
                                    }`}
                                >
                                    {STAGE_LABELS[stage]}
                                </span>

                                {isActive && (
                                    <span className="ml-auto text-xs text-zinc-500 animate-pulse">
                                        In progress...
                                    </span>
                                )}
                                {isDone && (
                                    <span className="ml-auto text-xs text-emerald-600">
                                        Done
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Latest message */}
            {latestEvent?.message && status === "processing" && (
                <p className="text-xs text-zinc-500 truncate">
                    {latestEvent.message}
                </p>
            )}
        </div>
    );
}
